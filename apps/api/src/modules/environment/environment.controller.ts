import {Body,Controller,Get,Post,Query,Req,UseGuards,Inject,BadRequestException} from '@nestjs/common';
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
