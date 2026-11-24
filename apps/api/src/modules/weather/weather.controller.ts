import { Body,Controller,Get,Post,Query,Param,Req,UseGuards,Inject,NotFoundException,ForbiddenException,ConflictException,BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { Database } from '../../common/database';
import { audit } from '../../common/audit';
import { parse,uuid } from '../../common/validation';
import { AuthGuard,requirePlatform,type AuthRequest } from '../auth/auth.guard';
import { inmetCatalog,parseCatalogCsv } from './inmet-catalog';
import { WeatherCache } from './weather-cache';
const date=z.string().datetime({offset:true});
@Controller('weather')
@UseGuards(AuthGuard)
export class WeatherController{
 constructor(@Inject(Database) private readonly db:Database,@Inject(WeatherCache) private readonly cache:WeatherCache){}
 private async authorize(req:AuthRequest,kind:'stations'|'forecast_locations',id:string){
  const row=(await this.db.query('SELECT t.id,t.enabled,t.last_success_at,t.last_attempt_at,t.last_error_at,t.consecutive_failures FROM '+kind+' t WHERE t.id=$1 AND ($2::boolean OR EXISTS (SELECT 1 FROM organization_municipalities om JOIN memberships m ON m.organization_id=om.organization_id WHERE om.municipality_id=t.municipality_id AND m.user_id=$3))',[id,req.actor.platformAdmin,req.actor.id])).rows[0];
  if(!row)throw new NotFoundException();return row;
 }
 @Get('inmet/discover') async discover(@Req() req:AuthRequest,@Query() query:unknown){
  requirePlatform(req.actor);const q=parse(z.object({municipalityId:uuid,radiusKm:z.coerce.number().min(1).max(150).default(100)}),query);
  const catalog=await inmetCatalog(this.db);
  const m=(await this.db.query('SELECT boundary IS NOT NULL AS known FROM municipalities WHERE id=$1',[q.municipalityId])).rows[0];if(!m?.known)throw new ConflictException('Importe a malha municipal');
  const rows=(await this.db.query(`WITH candidates AS (SELECT x.*,ST_SetSRID(ST_MakePoint(x.lon,x.lat),4326) AS geom FROM jsonb_to_recordset($2::jsonb) AS x(code text,name text,lat float8,lon float8,state text,status text))
   SELECT c.code,c.name,c.lat,c.lon,c.state,c.status,ST_Covers(m.boundary,c.geom) AS inside,ST_Distance(m.boundary::geography,c.geom::geography)/1000 AS distance_km,s.id AS registered_id,s.municipality_id AS registered_municipality_id
   FROM candidates c CROSS JOIN municipalities m LEFT JOIN stations s ON s.provider='inmet' AND s.external_id=c.code
   WHERE m.id=$1 AND ST_DWithin(m.boundary::geography,c.geom::geography,$3) ORDER BY distance_km,c.code LIMIT 50`,[q.municipalityId,JSON.stringify(catalog.data.map(c=>({code:c.CD_ESTACAO.toUpperCase(),name:c.DC_NOME,lat:c.VL_LATITUDE,lon:c.VL_LONGITUDE,state:c.SG_ESTADO??null,status:c.CD_SITUACAO??null}))),q.radiusKm*1000])).rows;
  return {data:rows,representativeness:'not_assessed',catalog:{source:catalog.source,fetchedAt:catalog.fetchedAt,stale:catalog.stale}};
 }
 @Post('inmet/register') async register(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const v=parse(z.object({municipalityId:uuid,code:z.string().regex(/^[A-Z0-9]{2,12}$/i)}).strict(),body);
  const candidate=(await inmetCatalog(this.db)).data.find(c=>c.CD_ESTACAO.toUpperCase()===v.code.toUpperCase());if(!candidate)throw new NotFoundException('Estação não encontrada no catálogo');
  return this.db.transaction(async c=>{
   const m=(await c.query('SELECT ST_Covers(boundary,ST_SetSRID(ST_MakePoint($2,$3),4326)) AS inside FROM municipalities WHERE id=$1 FOR SHARE',[v.municipalityId,candidate.VL_LONGITUDE,candidate.VL_LATITUDE])).rows[0];
   if(!m?.inside)throw new ConflictException('Estação externa ao município: consulte como referência regional, sem atribuir medições ao território');
   const row=(await c.query("INSERT INTO stations(municipality_id,provider,external_id,name,location) VALUES($1,'inmet',$2,$3,ST_SetSRID(ST_MakePoint($4,$5),4326)) ON CONFLICT(provider,external_id) DO NOTHING RETURNING id",[v.municipalityId,candidate.CD_ESTACAO.toUpperCase(),candidate.DC_NOME,candidate.VL_LONGITUDE,candidate.VL_LATITUDE])).rows[0];
   if(!row)throw new ConflictException('Estação já cadastrada');await audit(c,req.actor.id,'station.inmet.register',row.id);return row;
  });
 }
 @Post('forecast-locations/municipal-center') async center(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const {municipalityId}=parse(z.object({municipalityId:uuid}).strict(),body);
  return this.db.transaction(async c=>{
   const m=(await c.query('SELECT id,name,boundary IS NOT NULL AS known FROM municipalities WHERE id=$1 FOR UPDATE',[municipalityId])).rows[0];if(!m?.known)throw new ConflictException('Importe a malha municipal');
   const existing=(await c.query("SELECT id,name FROM forecast_locations WHERE municipality_id=$1 AND name='Referência municipal (IBGE)' ORDER BY id LIMIT 1",[municipalityId])).rows[0];if(existing)return existing;
   const row=(await c.query("INSERT INTO forecast_locations(municipality_id,name,location) SELECT id,'Referência municipal (IBGE)',ST_PointOnSurface(boundary) FROM municipalities WHERE id=$1 RETURNING id,name",[municipalityId])).rows[0]!;
   await audit(c,req.actor.id,'forecast_location.center',row.id);return row;
  });
 }
 @Post('inmet/catalog') async uploadCatalog(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const {csv}=parse(z.object({csv:z.string().min(1).max(1000000)}).strict(),body);
  let data:ReturnType<typeof parseCatalogCsv>;try{data=parseCatalogCsv(csv);}catch{throw new BadRequestException('CSV inválido: use o catálogo de estações automáticas do INMET');}
  return this.db.transaction(async c=>{await c.query("INSERT INTO inmet_catalog_cache(id,source,data) VALUES(true,'official_csv_upload',$1::jsonb) ON CONFLICT(id) DO UPDATE SET source=excluded.source,data=excluded.data,fetched_at=now()",[JSON.stringify(data)]);await audit(c,req.actor.id,'inmet.catalog.upload','inmet',null,{count:data.length});return {count:data.length};});
 }
 @Get('integration-status') async integrations(@Req() req:AuthRequest,@Query('municipalityId') raw:string){
  const id=parse(uuid,raw);const m=(await this.db.query('SELECT id FROM municipalities WHERE id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM organization_municipalities om JOIN memberships ms ON ms.organization_id=om.organization_id WHERE om.municipality_id=$1 AND ms.user_id=$3))',[id,req.actor.platformAdmin,req.actor.id])).rows[0];if(!m)throw new NotFoundException();
  const targets=(await this.db.query(`WITH targets AS (SELECT id,name,enabled,last_success_at,last_attempt_at,last_error_at,consecutive_failures,'station'::text AS kind FROM stations WHERE municipality_id=$1 AND provider='inmet' UNION ALL SELECT id,name,enabled,last_success_at,last_attempt_at,last_error_at,consecutive_failures,'forecast_location'::text FROM forecast_locations WHERE municipality_id=$1)
  SELECT t.*,r.status AS run_status,r.records_count,r.error_code,r.started_at,r.finished_at,q.requested_at AS pending_since FROM targets t LEFT JOIN LATERAL (SELECT status,records_count,error_code,started_at,finished_at FROM ingestion_runs WHERE target_id=t.id AND target_kind=t.kind ORDER BY started_at DESC LIMIT 1) r ON true LEFT JOIN LATERAL (SELECT requested_at FROM weather_sync_requests WHERE target_id=t.id AND target_kind=t.kind AND dispatched_at IS NULL ORDER BY requested_at DESC LIMIT 1) q ON true ORDER BY t.kind,t.name`,[id])).rows;
  const catalog=(await this.db.query('SELECT source,fetched_at,jsonb_array_length(data) AS count FROM inmet_catalog_cache WHERE id=true')).rows[0]??null;
  return {targets,catalog};
 }
 @Post('sync') async sync(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const v=parse(z.object({kind:z.enum(['station','forecast_location']),targetId:uuid}).strict(),body);const table=v.kind==='station'?'stations':'forecast_locations';
  return this.db.transaction(async c=>{
   const target=(await c.query('SELECT enabled FROM '+table+' WHERE id=$1'+(v.kind==='station'?" AND provider='inmet'":"")+' FOR UPDATE',[v.targetId])).rows[0];if(!target)throw new NotFoundException();if(!target.enabled)throw new ConflictException('Fonte desabilitada');
   const recent=(await c.query("SELECT id FROM weather_sync_requests WHERE target_kind=$1 AND target_id=$2 AND (dispatched_at IS NULL OR requested_at>now()-interval '5 minutes') ORDER BY requested_at DESC LIMIT 1",[v.kind,v.targetId])).rows[0];if(recent)return {id:recent.id,queued:true,reused:true};
   const row=(await c.query('INSERT INTO weather_sync_requests(target_kind,target_id,requested_by) VALUES($1,$2,$3) RETURNING id',[v.kind,v.targetId,req.actor.id])).rows[0]!;
   await audit(c,req.actor.id,'weather.sync.request',v.targetId,null,{kind:v.kind});return {id:row.id,queued:true,reused:false};
  });
 }
 @Post('target-enabled') async enabled(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const v=parse(z.object({kind:z.enum(['station','forecast_location']),targetId:uuid,enabled:z.boolean()}).strict(),body);const table=v.kind==='station'?'stations':'forecast_locations';
  return this.db.transaction(async c=>{const row=(await c.query('UPDATE '+table+' SET enabled=$2 WHERE id=$1 RETURNING id,enabled',[v.targetId,v.enabled])).rows[0];if(!row)throw new NotFoundException();await audit(c,req.actor.id,'weather.target.enabled',v.targetId,null,{enabled:v.enabled});return row;});
 }
 @Get('current') async current(@Req() req:AuthRequest,@Query('stationId') stationId:string){
  const id=parse(uuid,stationId),station=await this.authorize(req,'stations',id);
  const reading=await this.cache.get('current:'+id,async()=> (await this.db.query("SELECT id,observed_at,ingested_at,precipitation_mm,temperature_c,humidity_pct,wind_kmh,gust_kmh,pressure_hpa,quality FROM weather_readings WHERE station_id=$1 AND observed_at<=now() AND quality<>'missing' ORDER BY observed_at DESC LIMIT 1",[id])).rows[0]??null);
  const ageMinutes=reading?Math.max(0,(Date.now()-new Date(reading.observed_at).getTime())/60000):null;
  const status=!station.enabled?'disabled':ageMinutes===null?'unknown':ageMinutes>180?'stale':station.consecutive_failures>0?'degraded':'available';
  return {stationId:id,kind:'observation',status,ageMinutes,reading,sourceStatus:station};
 }
 @Get('history') async history(@Req() req:AuthRequest,@Query() query:unknown){
  const q=parse(z.object({stationId:uuid,from:date,to:date,limit:z.coerce.number().int().min(1).max(1000).default(500)}),query);
  const duration=Date.parse(q.to)-Date.parse(q.from);if(duration<=0||duration>31*86400000)throw new ForbiddenException('Intervalo deve ser de até 31 dias');
  await this.authorize(req,'stations',q.stationId);
  const rows=(await this.db.query('SELECT id,observed_at,ingested_at,precipitation_mm,temperature_c,humidity_pct,wind_kmh,gust_kmh,pressure_hpa,quality FROM weather_readings WHERE station_id=$1 AND observed_at >= $2 AND observed_at < $3 ORDER BY observed_at LIMIT $4',[q.stationId,q.from,q.to,q.limit+1])).rows;
  return {kind:'observation',data:rows.slice(0,q.limit),truncated:rows.length>q.limit};
 }
 @Get('rainfall') async rainfall(@Req() req:AuthRequest,@Query('stationId') stationId:string){
  const id=parse(uuid,stationId);await this.authorize(req,'stations',id);
  const result=await this.db.query(`WITH bounds AS (SELECT date_trunc('hour',now(),'UTC') AS end_at),
   windows AS (SELECT unnest(ARRAY[1,6,24,72]) AS hours)
   SELECT w.hours,b.end_at,COUNT(r.id)::int AS received_hours,
   COUNT(r.precipitation_mm)::int AS measured_hours,
   SUM(r.precipitation_mm)::float8 AS partial_mm
   FROM windows w CROSS JOIN bounds b LEFT JOIN weather_readings r
   ON r.station_id=$1 AND r.observed_at>b.end_at-make_interval(hours=>w.hours) AND r.observed_at<=b.end_at
   AND r.interval_minutes=60 AND r.quality IN ('valid','suspect') AND r.observed_at=date_trunc('hour',r.observed_at,'UTC')
   GROUP BY w.hours,b.end_at ORDER BY w.hours`,[id]);
  return {stationId:id,kind:'observation',windows:result.rows.map(r=>({hours:r.hours,endAt:r.end_at,receivedHours:r.received_hours,measuredHours:r.measured_hours,coverage:r.measured_hours/r.hours,complete:r.measured_hours===r.hours,totalMm:r.measured_hours===r.hours?r.partial_mm:null,partialMm:r.partial_mm}))};
 }
 @Get('forecast-locations') async locations(@Req() req:AuthRequest,@Query('municipalityId') raw?:string){
  const id=raw?parse(uuid,raw):null;
  return (await this.db.query('SELECT t.id,t.name,t.municipality_id,ST_Y(t.location) AS latitude,ST_X(t.location) AS longitude,t.enabled FROM forecast_locations t WHERE ($3::uuid IS NULL OR t.municipality_id=$3) AND ($1::boolean OR EXISTS (SELECT 1 FROM organization_municipalities om JOIN memberships m ON m.organization_id=om.organization_id WHERE om.municipality_id=t.municipality_id AND m.user_id=$2)) ORDER BY t.name LIMIT 500',[req.actor.platformAdmin,req.actor.id,id])).rows;
 }
 @Post('forecast-locations') async createLocation(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const v=parse(z.object({municipalityId:uuid,name:z.string().trim().min(1).max(150),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).strict(),body);
  return this.db.transaction(async c=>{if(!(await c.query('SELECT 1 FROM municipalities WHERE id=$1',[v.municipalityId])).rowCount)throw new NotFoundException();
   const row=(await c.query('INSERT INTO forecast_locations(municipality_id,name,location) VALUES($1,$2,ST_SetSRID(ST_MakePoint($3,$4),4326)) RETURNING id,name',[v.municipalityId,v.name,v.longitude,v.latitude])).rows[0]!;
   await audit(c,req.actor.id,'forecast_location.create',row.id);return row;});
 }
 @Get('forecast') async forecast(@Req() req:AuthRequest,@Query('locationId') locationId:string){
  const id=parse(uuid,locationId),target=await this.authorize(req,'forecast_locations',id);
  const rows=await this.cache.get('forecast:'+id,async()=> (await this.db.query(`SELECT valid_at,fetched_at,provider,precipitation_mm,precipitation_probability_pct,temperature_c,humidity_pct,wind_kmh,gust_kmh FROM weather_forecasts WHERE location_id=$1 AND provider='open-meteo' AND fetched_at=(SELECT max(fetched_at) FROM weather_forecasts WHERE location_id=$1 AND provider='open-meteo') ORDER BY valid_at`,[id])).rows,60);
  const fetchedAt=rows[0]?.fetched_at??null;
  const ageMinutes=fetchedAt?Math.max(0,(Date.now()-new Date(fetchedAt).getTime())/60000):null;
  const data=rows.filter(row=>new Date(row.valid_at).getTime()>=Date.now());
  return {locationId:id,kind:'forecast',provider:'open-meteo',fetchedAt,ageMinutes,status:!target.enabled?'disabled':!data.length?'unknown':ageMinutes!==null&&ageMinutes>180?'stale':target.consecutive_failures>0?'degraded':'available',data};
 }
 @Get('stations/:id/status') async status(@Req() req:AuthRequest,@Param('id') id:string){return this.authorize(req,'stations',parse(uuid,id));}
 @Get('ingestion-runs') async runs(@Req() req:AuthRequest,@Query() query:unknown){
  const q=parse(z.object({kind:z.enum(['station','forecast_location']),targetId:uuid}),query);await this.authorize(req,q.kind==='station'?'stations':'forecast_locations',q.targetId);
  return (await this.db.query('SELECT id,provider,started_at,finished_at,status,records_count,error_code FROM ingestion_runs WHERE target_kind=$1 AND target_id=$2 ORDER BY started_at DESC LIMIT 50',[q.kind,q.targetId])).rows;
 }
}
