import {Body,Controller,Get,Post,Query,Req,UseGuards,Inject,ConflictException,BadRequestException,BadGatewayException} from '@nestjs/common';
import {z} from 'zod';
import {Database} from '../../common/database';
import {audit} from '../../common/audit';
import {parse,uuid} from '../../common/validation';
import {AuthGuard,requirePlatform,type AuthRequest} from '../auth/auth.guard';
import {GeoService} from '../geo/geo.service';
import {hydroGeometry} from '../geo/geo.schemas';
import {fetchBho6,BHO6_SOURCE,BHO6_URL} from './bho6';
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
  const compositions=(await this.db.query('SELECT c.id,c.name,c.source,c.station_codes,c.margin_m3_s,c.updated_at,(c.id=m.public_flow_composition_id) IS TRUE AS public_main FROM hydro_compositions c JOIN municipalities m ON m.id=c.municipality_id WHERE c.municipality_id=$1 AND c.archived_at IS NULL ORDER BY c.name',[id])).rows;
  const data=[];
  for(const c of compositions){
   const members=(await this.db.query(`SELECT code AS station_code,t.station_name,t.enabled,t.last_error,t.last_success_at,v.observed_at,v.discharge_m3_s,v.discharge_quality FROM unnest($2::text[]) code LEFT JOIN ana_targets t ON t.municipality_id=$1 AND t.station_code=code AND t.archived_at IS NULL LEFT JOIN LATERAL(SELECT observed_at,discharge_m3_s,discharge_quality FROM ana_telemetry WHERE target_id=t.id ORDER BY observed_at DESC LIMIT 1)v ON true`,[id,c.station_codes])).rows;
   const history=(await this.db.query(`SELECT a.observed_at,sum(a.discharge_m3_s)::float8 AS measured_sum_m3_s,(sum(a.discharge_m3_s)+$3::float8)::float8 AS discharge_m3_s FROM ana_telemetry a JOIN ana_targets t ON t.id=a.target_id WHERE t.municipality_id=$1 AND t.station_code=ANY($2::text[]) AND t.archived_at IS NULL AND a.discharge_quality='Dado aprovado' AND a.discharge_m3_s IS NOT NULL AND a.observed_at BETWEEN now()-interval '7 days' AND now() GROUP BY a.observed_at HAVING count(DISTINCT t.station_code)=cardinality($2::text[]) ORDER BY a.observed_at DESC LIMIT 1000`,[id,c.station_codes,c.margin_m3_s])).rows;
   const latest=history[0]??null;
   const fresh=latest&&Date.now()-Date.parse(String(latest.observed_at))<=7200000;
   const complete=Boolean(fresh&&members.every(m=>m.enabled&&!m.last_error&&m.observed_at&&Date.parse(String(m.observed_at))===Date.parse(String(latest.observed_at))&&m.discharge_m3_s!==null&&m.discharge_quality==='Dado aprovado'));
   const issues=members.flatMap(m=>{const reason=!m.station_name?'Estação ausente':!m.enabled?'Coleta desativada':m.last_error?'Falha na coleta':!m.observed_at?'Sem leitura':m.discharge_m3_s==null||m.discharge_quality!=='Dado aprovado'?'Sem vazão aprovada':Date.now()-Date.parse(String(m.observed_at))>7200000?'Leitura desatualizada':!latest||Date.parse(String(m.observed_at))!==Date.parse(String(latest.observed_at))?'Horários diferentes':null;return reason?[{stationCode:m.station_code,reason}]:[];});
   const mixedValid=members.length===c.station_codes.length&&members.every(m=>m.enabled&&!m.last_error&&m.discharge_quality==='Dado aprovado'&&typeof m.discharge_m3_s==='number'&&Number.isFinite(m.discharge_m3_s)&&m.observed_at&&Date.parse(String(m.observed_at))<=Date.now()&&Date.now()-Date.parse(String(m.observed_at))<=86400000);
   const mixed=mixedValid?{discharge_m3_s:members.reduce((sum,m)=>sum+m.discharge_m3_s,0)+c.margin_m3_s,oldest_at:new Date(Math.min(...members.map(m=>Date.parse(String(m.observed_at))))).toISOString(),newest_at:new Date(Math.max(...members.map(m=>Date.parse(String(m.observed_at))))).toISOString()}:null;
   data.push({...c,members,mixed,latest:complete?latest:null,lastComplete:latest,history,issues,status:complete?'available':'unavailable'});
  }
  const imported=(await this.db.query('SELECT * FROM hydro_import_runs WHERE municipality_id=$1',[id])).rows[0]??null;
  const named=(await this.db.query("SELECT name,count(*)::int AS reaches FROM hydro_features WHERE municipality_id=$1 AND name<>'Trecho sem nome' GROUP BY name ORDER BY count(*) DESC,name LIMIT 200",[id])).rows;
  return {municipality,rivers:{...rivers,named,imported},compositions:data};
 }
 @Post('rivers/bho6') async syncBho6(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const {municipalityId}=parse(z.object({municipalityId:uuid}).strict(),body);await this.geo.scope(req.actor,municipalityId);
  const extent=(await this.db.query("SELECT boundary_version,md5(ST_AsEWKB(boundary)::text) AS digest,ARRAY[ST_XMin(boundary),ST_YMin(boundary),ST_XMax(boundary),ST_YMax(boundary)] AS bbox FROM municipalities WHERE id=$1 AND boundary IS NOT NULL",[municipalityId])).rows[0];
  if(!extent)throw new ConflictException('Importe a malha municipal primeiro');
  let rows:Awaited<ReturnType<typeof fetchBho6>>;
  try{rows=await fetchBho6(extent.bbox.map(Number));}catch(e){const code=e instanceof Error&&/^BHO6_[A-Z0-9_]+$/.test(e.message)?e.message:'BHO6_NETWORK_OR_INVALID_RESPONSE';throw new BadGatewayException('ANA BHO6: '+code);}
  return this.db.transaction(async c=>{
   const current=(await c.query("SELECT md5(ST_AsEWKB(boundary)::text) AS digest FROM municipalities WHERE id=$1 FOR UPDATE",[municipalityId])).rows[0];
   if(current?.digest!==extent.digest)throw new ConflictException('Malha alterada durante a consulta; repita a importação');
   await c.query('CREATE TEMP TABLE bho6_stage (external_id text PRIMARY KEY,name text,source_version text,downstream_external_id text,watercourse_type text,geometry geometry(MultiLineString,4326),attributes jsonb) ON COMMIT DROP');
   for(let i=0;i<rows.length;i+=100){
    await c.query(`INSERT INTO bho6_stage SELECT x.external_id,x.name,x.source_version,x.downstream_external_id,x.watercourse_type,ST_Multi(ST_CollectionExtract(ST_Intersection(m.boundary,ST_SetSRID(ST_GeomFromGeoJSON(x.geometry),4326)),2)),x.attributes FROM jsonb_to_recordset($2::jsonb) AS x(external_id text,name text,source_version text,downstream_external_id text,watercourse_type text,geometry jsonb,attributes jsonb) CROSS JOIN municipalities m WHERE m.id=$1`,[municipalityId,JSON.stringify(rows.slice(i,i+100))]);
   }
   if((await c.query('SELECT 1 FROM bho6_stage WHERE geometry IS NULL OR NOT ST_IsValid(geometry) LIMIT 1')).rowCount)throw new BadGatewayException('ANA BHO6: geometria inválida');
   await c.query('DELETE FROM bho6_stage WHERE ST_IsEmpty(geometry)');
   const imported=(await c.query('SELECT count(*)::int AS n FROM bho6_stage')).rows[0].n;
   if(!imported)throw new BadGatewayException('ANA BHO6: nenhum trecho intersecta a malha');
   await c.query(`INSERT INTO hydro_features(municipality_id,source,external_id,name,source_version,downstream_external_id,watercourse_type,geometry,source_attributes)
    SELECT $1,$2,external_id,name,source_version,downstream_external_id,watercourse_type,geometry,attributes FROM bho6_stage
    ON CONFLICT(municipality_id,source,external_id) DO UPDATE SET name=excluded.name,source_version=excluded.source_version,downstream_external_id=excluded.downstream_external_id,watercourse_type=excluded.watercourse_type,geometry=excluded.geometry,source_attributes=excluded.source_attributes,updated_at=now()`,[municipalityId,BHO6_SOURCE]);
   await c.query('DELETE FROM hydro_features h WHERE municipality_id=$1 AND source=$2 AND NOT EXISTS(SELECT 1 FROM bho6_stage s WHERE s.external_id=h.external_id)',[municipalityId,BHO6_SOURCE]);
   await c.query('INSERT INTO hydro_import_runs(municipality_id,source_url,boundary_version,received,imported) VALUES($1,$2,$3,$4,$5) ON CONFLICT(municipality_id) DO UPDATE SET source_url=excluded.source_url,boundary_version=excluded.boundary_version,received=excluded.received,imported=excluded.imported,imported_at=now()',[municipalityId,BHO6_URL,extent.boundary_version,rows.length,imported]);
   await audit(c,req.actor.id,'hydrology.bho6.sync',municipalityId,null,{received:rows.length,imported});return {received:rows.length,imported};
  });
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
  requirePlatform(req.actor);const v=parse(z.object({id:uuid.optional(),municipalityId:uuid,name,source:name,stationCodes:z.array(station).min(2).max(20),marginM3s:z.number().finite().min(0).max(1000000).default(0)}).strict(),body);await this.geo.scope(req.actor,v.municipalityId);
  if(new Set(v.stationCodes).size!==v.stationCodes.length)throw new BadRequestException('Estações duplicadas');
  return this.db.transaction(async c=>{
   await c.query('SELECT id FROM municipalities WHERE id=$1 FOR UPDATE',[v.municipalityId]);
   const n=(await c.query('SELECT count(*)::int AS n FROM ana_targets WHERE municipality_id=$1 AND archived_at IS NULL AND station_code=ANY($2::text[])',[v.municipalityId,v.stationCodes])).rows[0]?.n;if(n!==v.stationCodes.length)throw new BadRequestException('Selecione estações cadastradas e não removidas deste município');
   if((await c.query('SELECT 1 FROM hydro_compositions WHERE municipality_id=$1 AND name=$2 AND ($3::uuid IS NULL OR id<>$3)',[v.municipalityId,v.name,v.id??null])).rowCount)throw new ConflictException('Nome de composição já cadastrado, inclusive arquivadas');
   const row=v.id?(await c.query('UPDATE hydro_compositions SET name=$3,source=$4,station_codes=$5,margin_m3_s=$6,updated_at=now() WHERE id=$1 AND municipality_id=$2 AND archived_at IS NULL RETURNING id',[v.id,v.municipalityId,v.name,v.source,v.stationCodes,v.marginM3s])).rows[0]:(await c.query('INSERT INTO hydro_compositions(municipality_id,name,source,station_codes,margin_m3_s) VALUES($1,$2,$3,$4,$5) RETURNING id',[v.municipalityId,v.name,v.source,v.stationCodes,v.marginM3s])).rows[0];
   if(!row)throw new BadRequestException('Composição não encontrada neste município');
   await audit(c,req.actor.id,'hydrology.composition',row.id,null,{municipalityId:v.municipalityId,name:v.name,stationCodes:v.stationCodes,marginM3s:v.marginM3s,source:v.source});return row;
  });
 }
 @Post('compositions/public-main') async publicMain(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const v=parse(z.object({municipalityId:uuid,id:uuid.nullable()}).strict(),body);await this.geo.scope(req.actor,v.municipalityId);
  return this.db.transaction(async c=>{await c.query('SELECT id FROM municipalities WHERE id=$1 FOR UPDATE',[v.municipalityId]);if(v.id&&!(await c.query('SELECT 1 FROM hydro_compositions WHERE id=$1 AND municipality_id=$2 AND archived_at IS NULL',[v.id,v.municipalityId])).rowCount)throw new BadRequestException('Composição não encontrada neste município');await c.query('UPDATE municipalities SET public_flow_composition_id=$2 WHERE id=$1',[v.municipalityId,v.id]);await audit(c,req.actor.id,'hydrology.public-main',v.municipalityId,null,{compositionId:v.id});return {success:true};});
 }
 @Post('compositions/archive') async archiveComposition(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const v=parse(z.object({municipalityId:uuid,id:uuid}).strict(),body);await this.geo.scope(req.actor,v.municipalityId);
  return this.db.transaction(async c=>{await c.query('SELECT id FROM municipalities WHERE id=$1 FOR UPDATE',[v.municipalityId]);const row=(await c.query('UPDATE hydro_compositions SET archived_at=now(),updated_at=now() WHERE id=$1 AND municipality_id=$2 AND archived_at IS NULL RETURNING id',[v.id,v.municipalityId])).rows[0];if(!row)throw new BadRequestException('Composição não encontrada');await audit(c,req.actor.id,'hydrology.composition.archive',row.id,null,{municipalityId:v.municipalityId});return row;});
 }
 @Post('station-enabled') async enable(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const v=parse(z.object({municipalityId:uuid,stationCode:station,enabled:z.boolean()}).strict(),body);await this.geo.scope(req.actor,v.municipalityId);
  return this.db.transaction(async c=>{const row=(await c.query('UPDATE ana_targets SET enabled=$3,next_due=CASE WHEN $3 THEN now() ELSE next_due END WHERE municipality_id=$1 AND station_code=$2 AND archived_at IS NULL RETURNING id',[v.municipalityId,v.stationCode,v.enabled])).rows[0];if(!row)throw new BadRequestException('Estação não cadastrada');await audit(c,req.actor.id,'hydrology.station.enabled',row.id,null,{enabled:v.enabled});return row;});
 }
}
