import {Body,Controller,Get,Post,Param,Inject,NotFoundException,Header} from '@nestjs/common';
import {z} from 'zod';
import {Database} from '../../common/database';
import {parse} from '../../common/validation';
import {getWarnings} from './inmet-warnings';
import {getPublicRiver} from './public-river';
const code=z.string().regex(/^\d{7}$/);
const registered="EXISTS (SELECT 1 FROM organization_municipalities om WHERE om.municipality_id=m.id)";
@Controller('public')
export class PublicController {
 constructor(@Inject(Database) private readonly db:Database){}
 @Get('municipalities') @Header('Cache-Control','public, max-age=60') async municipalities(){
  return (await this.db.query('SELECT m.ibge_code,m.name,m.state FROM municipalities m WHERE '+registered+' ORDER BY m.name,m.state LIMIT 5570')).rows;
 }
 @Post('locate') @Header('Cache-Control','no-store') async locate(@Body() body:unknown){
  const v=parse(z.object({latitude:z.number().finite().min(-90).max(90),longitude:z.number().finite().min(-180).max(180)}).strict(),body);
  const rows=(await this.db.query('SELECT m.ibge_code,m.name,m.state FROM municipalities m WHERE '+registered+' AND ST_Covers(m.boundary,ST_SetSRID(ST_MakePoint($1,$2),4326)) ORDER BY m.ibge_code LIMIT 2',[v.longitude,v.latitude])).rows;
  return {municipality:rows.length===1?rows[0]:null};
 }
 @Get('municipalities/:code/warnings') @Header('Cache-Control','public, max-age=30') async warnings(@Param('code') raw:string){
  const ibge=parse(code,raw);const m=(await this.db.query('SELECT m.id,boundary IS NOT NULL AS known FROM municipalities m WHERE m.ibge_code=$1 AND '+registered,[ibge])).rows[0];if(!m)throw new NotFoundException();
  const snapshot=await getWarnings();const now=Date.now();const warnings=[];
  for(const w of snapshot.warnings){if(Date.parse(w.endsAt)<=now||Date.parse(w.startsAt)>now+5*86400000)continue;
   let match=w.municipalities.includes(ibge);
   if(!match&&!w.municipalities.length&&m.known&&w.polygons.length){const geometry={type:'MultiPolygon',coordinates:w.polygons.map(r=>[r])};match=!!(await this.db.query("SELECT ST_Intersects(boundary,ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326))) AS hit FROM municipalities WHERE id=$1",[m.id,JSON.stringify(geometry)])).rows[0]?.hit;}
   if(match){const {municipalities,polygons,...publicWarning}=w;warnings.push({...publicWarning,geometry:polygons.length?{type:'MultiPolygon',coordinates:polygons.map(r=>[r])}:null});}
  }
  return {status:snapshot.status==='available'&&now-snapshot.fetchedAt<600000&&m.known?'available':'unavailable',fetchedAt:snapshot.fetchedAt?new Date(snapshot.fetchedAt).toISOString():null,warnings};
 }
 @Get('municipalities/:code/dashboard') @Header('Cache-Control','public, max-age=30') async dashboard(@Param('code') raw:string){
  const ibge=parse(code,raw);
  const m=(await this.db.query('SELECT m.id,m.ibge_code,m.name,m.state,m.main_river,ST_X(ST_PointOnSurface(m.boundary)) AS longitude,ST_Y(ST_PointOnSurface(m.boundary)) AS latitude FROM municipalities m WHERE m.ibge_code=$1 AND '+registered,[ibge])).rows[0];
  if(!m)throw new NotFoundException('Município não disponível');
  const forecast=(await this.db.query(`SELECT f.id,f.name,f.consecutive_failures,s.fetched_at FROM forecast_locations f CROSS JOIN LATERAL(SELECT max(w.fetched_at) AS fetched_at FROM weather_forecasts w WHERE w.location_id=f.id AND w.provider='open-meteo') s WHERE f.municipality_id=$1 AND f.enabled AND s.fetched_at IS NOT NULL ORDER BY (f.name='Referência municipal (IBGE)') DESC,s.fetched_at DESC,f.id LIMIT 1`,[m.id])).rows[0];
  const hours=forecast?(await this.db.query(`SELECT valid_at,temperature_c::float8,humidity_pct::float8,wind_kmh::float8,precipitation_mm::float8,precipitation_probability_pct::float8,weather_code,is_day,cloud_cover_pct::float8,apparent_temperature_c::float8 FROM weather_forecasts WHERE location_id=$1 AND provider='open-meteo' AND fetched_at=$2 AND valid_at>=date_trunc('hour',now(),'UTC') AND valid_at<(date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo')+interval '6 days') AT TIME ZONE 'America/Sao_Paulo' ORDER BY valid_at LIMIT 144`,[forecast.id,forecast.fetched_at])).rows:[];
  const forecastFresh=forecast&&Date.now()-new Date(forecast.fetched_at).getTime()<=180*60000&&forecast.consecutive_failures===0;
  const daily=forecast?(await this.db.query(`WITH days AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date+i AS day FROM generate_series(0,5) i)
   SELECT to_char(d.day,'YYYY-MM-DD') AS date,count(w.id)::int AS hours,
   CASE WHEN count(w.temperature_c)=24 THEN min(w.temperature_c)::float8 END AS min_c,
   CASE WHEN count(w.temperature_c)=24 THEN max(w.temperature_c)::float8 END AS max_c,
   CASE WHEN count(w.precipitation_mm)=24 THEN sum(w.precipitation_mm)::float8 END AS rain_mm,
   CASE WHEN count(w.precipitation_probability_pct)=24 THEN max(w.precipitation_probability_pct)::float8 END AS rain_probability_pct
   FROM days d LEFT JOIN weather_forecasts w ON w.location_id=$1 AND w.provider='open-meteo' AND w.fetched_at=$2 AND (w.valid_at AT TIME ZONE 'America/Sao_Paulo')::date=d.day GROUP BY d.day ORDER BY d.day`,[forecast.id,forecast.fetched_at])).rows:[];
  const observation=(await this.db.query(`SELECT s.name,r.observed_at,r.temperature_c::float8,r.humidity_pct::float8,r.wind_kmh::float8,CASE WHEN effective_precipitation_quality(r.precipitation_mm,r.precipitation_quality,r.quality)='valid' THEN r.precipitation_mm::float8 END AS precipitation_mm FROM stations s JOIN municipalities m ON m.id=s.municipality_id JOIN LATERAL(SELECT * FROM weather_readings WHERE station_id=s.id AND observed_at BETWEEN now()-interval '3 hours' AND now() AND quality='valid' ORDER BY observed_at DESC LIMIT 1) r ON true WHERE s.municipality_id=$1 AND s.enabled AND s.provider='inmet' AND s.consecutive_failures=0 AND ST_Covers(m.boundary,s.location) ORDER BY r.observed_at DESC,s.id LIMIT 1`,[m.id])).rows[0]??null;
  const river = await getPublicRiver(this.db, m.id, ibge);
  return {municipality:{ibge_code:m.ibge_code,name:m.name,state:m.state,main_river:m.main_river,longitude:m.longitude,latitude:m.latitude},weather:{observation,forecast:forecast?{status:forecastFresh?'available':'stale',fetchedAt:forecast.fetched_at,current:forecastFresh?hours[0]??null:null,today:forecastFresh?daily[0]??null:null,daily:forecastFresh?daily.slice(1):[]}:null},river,risk:{status:'not_assessed',message:'Risco indeterminado: não há limite de transbordamento homologado para publicação. Ausência de avaliação não significa segurança.'}};
 }
}
