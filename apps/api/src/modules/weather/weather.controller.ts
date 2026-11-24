import { Body,Controller,Get,Post,Query,Param,Req,UseGuards,Inject,NotFoundException,ForbiddenException } from '@nestjs/common';
import { z } from 'zod';
import { Database } from '../../common/database';
import { audit } from '../../common/audit';
import { parse,uuid } from '../../common/validation';
import { AuthGuard,requirePlatform,type AuthRequest } from '../auth/auth.guard';
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
 @Get('forecast-locations') async locations(@Req() req:AuthRequest){
  return (await this.db.query('SELECT t.id,t.name,t.municipality_id,ST_Y(t.location) AS latitude,ST_X(t.location) AS longitude,t.enabled FROM forecast_locations t WHERE $1::boolean OR EXISTS (SELECT 1 FROM organization_municipalities om JOIN memberships m ON m.organization_id=om.organization_id WHERE om.municipality_id=t.municipality_id AND m.user_id=$2) ORDER BY t.name LIMIT 500',[req.actor.platformAdmin,req.actor.id])).rows;
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
