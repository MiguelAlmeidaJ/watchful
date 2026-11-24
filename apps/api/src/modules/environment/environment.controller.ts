import {Body,Controller,Get,Post,Query,Req,UseGuards,Inject,BadRequestException,NotFoundException,Param,ConflictException} from '@nestjs/common';
import {z} from 'zod';
import {Database} from '../../common/database';
import {audit} from '../../common/audit';
import {parse,uuid} from '../../common/validation';
import {AuthGuard,requirePlatform,type AuthRequest} from '../auth/auth.guard';
import {GeoService} from '../geo/geo.service';
const measurement=z.object({observedAt:z.string().datetime({offset:true}),metric:z.enum(['river_level_m','discharge_m3_s','rainfall_mm']),value:z.number().finite(),intervalMinutes:z.number().int().min(1).max(1440).optional()}).strict();
const input=z.object({municipalityId:uuid,provider:z.enum(['ana','cemaden']),stationCode:z.string().trim().min(1).max(100),stationName:z.string().trim().min(1).max(150),sourceReference:z.string().trim().min(1).max(500),measurements:z.array(measurement).min(1).max(5000)}).strict();
@Controller('environment')
@UseGuards(AuthGuard)
export class EnvironmentController{
 constructor(@Inject(Database) private readonly db:Database,@Inject(GeoService) private readonly geo:GeoService){}
 @Post('ana/targets') async registerAna(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const v=parse(z.object({municipalityId:uuid,stationCode:z.string().regex(/^\d{8}$/),stationName:z.string().trim().min(1).max(150)}).strict(),body);await this.geo.scope(req.actor,v.municipalityId);
  return this.db.transaction(async c=>{await c.query('SELECT id FROM municipalities WHERE id=$1 FOR UPDATE',[v.municipalityId]);const row=(await c.query('INSERT INTO ana_targets(municipality_id,station_code,station_name) VALUES($1,$2,$3) ON CONFLICT(municipality_id,station_code) DO UPDATE SET station_name=excluded.station_name,enabled=CASE WHEN ana_targets.archived_at IS NOT NULL THEN true ELSE ana_targets.enabled END,next_due=CASE WHEN ana_targets.archived_at IS NOT NULL THEN now() ELSE ana_targets.next_due END,archived_at=NULL RETURNING id',[v.municipalityId,v.stationCode,v.stationName])).rows[0]!;await audit(c,req.actor.id,'ana.target.register',row.id);return row;});
 }
 @Get('ana/targets') async anaTargets(@Req() req:AuthRequest,@Query('municipalityId') raw:string){
  const id=parse(uuid,raw);await this.geo.scope(req.actor,id);
  return (await this.db.query(`SELECT t.*,v.observed_at,v.discharge_m3_s,v.discharge_quality FROM ana_targets t LEFT JOIN LATERAL(SELECT observed_at,discharge_m3_s,discharge_quality FROM ana_telemetry WHERE target_id=t.id ORDER BY observed_at DESC LIMIT 1)v ON true WHERE t.municipality_id=$1 AND t.archived_at IS NULL ORDER BY t.station_name`,[id])).rows;
 }
 @Post('ana/targets/:id/archive') async archiveAna(@Req() req:AuthRequest,@Param('id') raw:string,@Body() body:unknown){
  requirePlatform(req.actor);const id=parse(uuid,raw),v=parse(z.object({municipalityId:uuid}).strict(),body);await this.geo.scope(req.actor,v.municipalityId);
  return this.db.transaction(async c=>{
   await c.query('SELECT id FROM municipalities WHERE id=$1 FOR UPDATE',[v.municipalityId]);
   const t=(await c.query('SELECT station_code FROM ana_targets WHERE id=$1 AND municipality_id=$2 AND archived_at IS NULL FOR UPDATE',[id,v.municipalityId])).rows[0];if(!t)throw new NotFoundException('Estação não encontrada');
   const used=(await c.query('SELECT name FROM hydro_compositions WHERE municipality_id=$1 AND archived_at IS NULL AND $2=ANY(station_codes)',[v.municipalityId,t.station_code])).rows;
   if(used.length)throw new ConflictException('Retire a estação das composições antes de removê-la: '+used.map(x=>x.name).join(', '));
   await c.query('UPDATE ana_targets SET enabled=false,archived_at=now() WHERE id=$1',[id]);await audit(c,req.actor.id,'ana.target.archive',id,null,{municipalityId:v.municipalityId,stationCode:t.station_code});return {success:true};
  });
 }
 @Get('ana/targets/:id/history') async anaHistory(@Req() req:AuthRequest,@Param('id') raw:string){
  const id=parse(uuid,raw);const t=(await this.db.query('SELECT municipality_id FROM ana_targets WHERE id=$1',[id])).rows[0];if(!t)throw new NotFoundException();await this.geo.scope(req.actor,t.municipality_id);
  return (await this.db.query("SELECT observed_at,discharge_m3_s,discharge_quality FROM ana_telemetry WHERE target_id=$1 AND observed_at>=now()-interval '7 days' ORDER BY observed_at DESC LIMIT 1000",[id])).rows;
 }
 @Post('imports') async upload(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const v=parse(input,body);await this.geo.scope(req.actor,v.municipalityId);
  const seen=new Set<string>();
  for(const m of v.measurements){
   const time=Date.parse(m.observedAt),key=new Date(time).toISOString()+':'+m.metric;
   if(time>Date.now()||seen.has(key)||(v.provider==='cemaden')!==(m.metric==='rainfall_mm')||(m.metric==='rainfall_mm')!==(m.intervalMinutes!==undefined)||(m.metric!=='river_level_m'&&m.value<0))throw new BadRequestException('Medições duplicadas, futuras ou incompatíveis com a fonte/unidade');
   seen.add(key);
  }
  return this.db.transaction(async c=>{
   const row=(await c.query('INSERT INTO environmental_imports(municipality_id,provider,station_code,station_name,source_reference,imported_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[v.municipalityId,v.provider,v.stationCode,v.stationName,v.sourceReference,req.actor.id])).rows[0]!;
   await c.query(`INSERT INTO environmental_observations(import_id,observed_at,metric,value,interval_minutes) SELECT $1,x."observedAt"::timestamptz,x.metric,x.value,x."intervalMinutes" FROM jsonb_to_recordset($2::jsonb) AS x("observedAt" text,metric text,value float8,"intervalMinutes" int)`,[row.id,JSON.stringify(v.measurements)]);
   await audit(c,req.actor.id,'environment.import',row.id,null,{provider:v.provider,count:v.measurements.length});return {id:row.id,count:v.measurements.length};
  });
 }
 @Get('summary') async summary(@Req() req:AuthRequest,@Query('municipalityId') raw:string){
  const id=parse(uuid,raw);await this.geo.scope(req.actor,id);
  const rows=(await this.db.query(`SELECT DISTINCT ON(i.provider,i.station_code,o.metric) i.provider,i.station_code,i.station_name,i.source_reference,i.imported_at,o.observed_at,o.metric,o.value,o.interval_minutes FROM environmental_imports i JOIN environmental_observations o ON o.import_id=i.id WHERE i.municipality_id=$1 ORDER BY i.provider,i.station_code,o.metric,o.observed_at DESC,i.imported_at DESC LIMIT 100`,[id])).rows;
  return {data:rows,mode:'manual_import',representativeness:'not_assessed'};
 }
}
