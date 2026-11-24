import {Body,Controller,Get,Post,Query,Req,UseGuards,Inject,ConflictException,BadRequestException} from '@nestjs/common';
import {z} from 'zod';
import {Database} from '../../common/database';
import {audit} from '../../common/audit';
import {parse,uuid} from '../../common/validation';
import {AuthGuard,requirePlatform,type AuthRequest} from '../auth/auth.guard';
import {GeoService} from '../geo/geo.service';
import {hydroGeometry} from '../geo/geo.schemas';
const name=z.string().trim().min(1).max(150);
const station=z.string().regex(/^\d{8}$/);
const river=z.object({externalId:name,name:name.nullable(),downstreamExternalId:name.nullable().optional(),watercourseType:name.optional(),geometry:hydroGeometry}).strict();
@Controller('hydrology')
@UseGuards(AuthGuard)
export class HydrologyController{
 constructor(@Inject(Database) private readonly db:Database,@Inject(GeoService) private readonly geo:GeoService){}
 @Get('summary') async summary(@Req() req:AuthRequest,@Query('municipalityId') raw:string){
  const id=parse(uuid,raw);await this.geo.scope(req.actor,id);
  const municipality=(await this.db.query('SELECT main_river,main_river_source FROM municipalities WHERE id=$1',[id])).rows[0];
  const rivers=(await this.db.query('SELECT count(*)::int AS count,count(DISTINCT name)::int AS named_groups FROM hydro_features WHERE municipality_id=$1',[id])).rows[0];
  const compositions=(await this.db.query('SELECT id,name,source,station_codes FROM hydro_compositions WHERE municipality_id=$1 ORDER BY name',[id])).rows;
  const data=[];
  for(const c of compositions){
   const members=(await this.db.query(`SELECT code AS station_code,t.station_name,t.enabled,t.last_error,t.last_success_at,v.observed_at,v.discharge_m3_s FROM unnest($2::text[]) code LEFT JOIN ana_targets t ON t.municipality_id=$1 AND t.station_code=code LEFT JOIN LATERAL(SELECT observed_at,discharge_m3_s FROM ana_telemetry WHERE target_id=t.id ORDER BY observed_at DESC LIMIT 1)v ON true`,[id,c.station_codes])).rows;
   const history=(await this.db.query(`SELECT a.observed_at,sum(a.discharge_m3_s)::float8 AS discharge_m3_s FROM ana_telemetry a JOIN ana_targets t ON t.id=a.target_id WHERE t.municipality_id=$1 AND t.station_code=ANY($2::text[]) AND t.enabled AND a.discharge_quality='Dado aprovado' AND a.discharge_m3_s IS NOT NULL AND a.observed_at BETWEEN now()-interval '7 days' AND now() GROUP BY a.observed_at HAVING count(DISTINCT t.station_code)=cardinality($2::text[]) ORDER BY a.observed_at DESC LIMIT 1000`,[id,c.station_codes])).rows;
   const latest=history[0]??null;
   const fresh=latest&&Date.now()-Date.parse(String(latest.observed_at))<=7200000;
   const complete=Boolean(fresh&&members.every(m=>m.enabled&&!m.last_error&&m.observed_at&&Date.parse(String(m.observed_at))===Date.parse(String(latest.observed_at))&&m.discharge_m3_s!==null));
   data.push({...c,members,latest:complete?latest:null,lastComplete:latest,history,status:complete?'available':'unavailable'});
  }
  return {municipality,rivers,compositions:data};
 }
 @Post('main-river') async main(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const v=parse(z.object({municipalityId:uuid,name,source:name}).strict(),body);await this.geo.scope(req.actor,v.municipalityId);
  return this.db.transaction(async c=>{await c.query('UPDATE municipalities SET main_river=$2,main_river_source=$3 WHERE id=$1',[v.municipalityId,v.name,v.source]);await audit(c,req.actor.id,'hydrology.main-river',v.municipalityId,null,{name:v.name,source:v.source});return {success:true};});
 }
 @Post('rivers/import') async importRivers(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const v=parse(z.object({municipalityId:uuid,source:name,sourceVersion:name,features:z.array(river).min(1).max(50)}).strict(),body);await this.geo.scope(req.actor,v.municipalityId);
  if(new Set(v.features.map(x=>x.externalId)).size!==v.features.length)throw new BadRequestException('Trechos duplicados');
  return this.db.transaction(async c=>{
   const m=(await c.query('SELECT boundary IS NOT NULL AS known FROM municipalities WHERE id=$1 FOR SHARE',[v.municipalityId])).rows[0];if(!m?.known)throw new ConflictException('Importe a malha municipal primeiro');
   let changed=0;for(const x of v.features){
    const res=await c.query(`WITH original AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($5::text),4326) AS g), clipped AS (SELECT ST_Multi(ST_CollectionExtract(ST_Intersection(m.boundary,original.g),2)) AS g FROM municipalities m CROSS JOIN original WHERE m.id=$1 AND ST_IsValid(original.g))
    INSERT INTO hydro_features(municipality_id,name,source,external_id,geometry,source_version,downstream_external_id,watercourse_type)
    SELECT $1,$2,$3,$4,g,$6,$7,$8 FROM clipped WHERE NOT ST_IsEmpty(g) AND ST_IsValid(g)
    ON CONFLICT(municipality_id,source,external_id) DO UPDATE SET name=excluded.name,geometry=excluded.geometry,source_version=excluded.source_version,downstream_external_id=excluded.downstream_external_id,watercourse_type=excluded.watercourse_type,updated_at=now()`,[v.municipalityId,x.name??'Trecho sem nome',v.source,x.externalId,JSON.stringify(x.geometry),v.sourceVersion,x.downstreamExternalId??null,x.watercourseType??null]);changed+=res.rowCount??0;
   }await audit(c,req.actor.id,'hydrology.rivers.import',v.municipalityId,null,{source:v.source,version:v.sourceVersion,received:v.features.length,changed});return {received:v.features.length,changed};
  });
 }
 @Post('compositions') async composition(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const v=parse(z.object({municipalityId:uuid,name,source:name,stationCodes:z.array(station).min(2).max(20)}).strict(),body);await this.geo.scope(req.actor,v.municipalityId);
  if(new Set(v.stationCodes).size!==v.stationCodes.length)throw new BadRequestException('Estações duplicadas');
  return this.db.transaction(async c=>{const n=(await c.query('SELECT count(*)::int AS n FROM ana_targets WHERE municipality_id=$1 AND station_code=ANY($2::text[])',[v.municipalityId,v.stationCodes])).rows[0]?.n;if(n!==v.stationCodes.length)throw new BadRequestException('Cadastre todas as estações no município');
   const row=(await c.query('INSERT INTO hydro_compositions(municipality_id,name,source,station_codes) VALUES($1,$2,$3,$4) ON CONFLICT(municipality_id,name) DO UPDATE SET source=excluded.source,station_codes=excluded.station_codes RETURNING id',[v.municipalityId,v.name,v.source,v.stationCodes])).rows[0]!;await audit(c,req.actor.id,'hydrology.composition',row.id,null,{stationCodes:v.stationCodes});return row;});
 }
 @Post('station-enabled') async enable(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const v=parse(z.object({municipalityId:uuid,stationCode:station,enabled:z.boolean()}).strict(),body);await this.geo.scope(req.actor,v.municipalityId);
  return this.db.transaction(async c=>{const row=(await c.query('UPDATE ana_targets SET enabled=$3,next_due=CASE WHEN $3 THEN now() ELSE next_due END WHERE municipality_id=$1 AND station_code=$2 RETURNING id',[v.municipalityId,v.stationCode,v.enabled])).rows[0];if(!row)throw new BadRequestException('Estação não cadastrada');await audit(c,req.actor.id,'hydrology.station.enabled',row.id,null,{enabled:v.enabled});return row;});
 }
}
