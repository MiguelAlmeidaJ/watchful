import {Body,Controller,Get,Post,Param,Inject,NotFoundException,Header} from '@nestjs/common';
import {z} from 'zod';
import {Database} from '../../common/database';
import {parse} from '../../common/validation';
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
 @Get('municipalities/:code/dashboard') @Header('Cache-Control','public, max-age=30') async dashboard(@Param('code') raw:string){
  const ibge=parse(code,raw);
  const m=(await this.db.query('SELECT m.id,m.ibge_code,m.name,m.state,m.main_river FROM municipalities m WHERE m.ibge_code=$1 AND '+registered,[ibge])).rows[0];
  if(!m)throw new NotFoundException('Município não disponível');
  const forecast=(await this.db.query(`SELECT f.id,f.name,f.consecutive_failures,s.fetched_at FROM forecast_locations f CROSS JOIN LATERAL(SELECT max(w.fetched_at) AS fetched_at FROM weather_forecasts w WHERE w.location_id=f.id AND w.provider='open-meteo') s WHERE f.municipality_id=$1 AND f.enabled AND s.fetched_at IS NOT NULL ORDER BY (f.name='Referência municipal (IBGE)') DESC,s.fetched_at DESC,f.id LIMIT 1`,[m.id])).rows[0];
  const hours=forecast?(await this.db.query(`SELECT valid_at,temperature_c::float8,humidity_pct::float8,wind_kmh::float8,precipitation_mm::float8,precipitation_probability_pct::float8 FROM weather_forecasts WHERE location_id=$1 AND provider='open-meteo' AND fetched_at=$2 AND valid_at>=date_trunc('hour',now(),'UTC') AND valid_at<(date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo')+interval '6 days') AT TIME ZONE 'America/Sao_Paulo' ORDER BY valid_at LIMIT 144`,[forecast.id,forecast.fetched_at])).rows:[];
  const forecastFresh=forecast&&Date.now()-new Date(forecast.fetched_at).getTime()<=180*60000&&forecast.consecutive_failures===0;
  const daily=forecast?(await this.db.query(`WITH days AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date+i AS day FROM generate_series(1,5) i)
   SELECT to_char(d.day,'YYYY-MM-DD') AS date,count(w.id)::int AS hours,
   CASE WHEN count(w.temperature_c)=24 THEN min(w.temperature_c)::float8 END AS min_c,
   CASE WHEN count(w.temperature_c)=24 THEN max(w.temperature_c)::float8 END AS max_c,
   CASE WHEN count(w.precipitation_mm)=24 THEN sum(w.precipitation_mm)::float8 END AS rain_mm,
   CASE WHEN count(w.precipitation_probability_pct)=24 THEN max(w.precipitation_probability_pct)::float8 END AS rain_probability_pct
   FROM days d LEFT JOIN weather_forecasts w ON w.location_id=$1 AND w.provider='open-meteo' AND w.fetched_at=$2 AND (w.valid_at AT TIME ZONE 'America/Sao_Paulo')::date=d.day GROUP BY d.day ORDER BY d.day`,[forecast.id,forecast.fetched_at])).rows:[];
  const observation=(await this.db.query(`SELECT s.name,r.observed_at,r.temperature_c::float8,r.humidity_pct::float8,r.wind_kmh::float8,CASE WHEN effective_precipitation_quality(r.precipitation_mm,r.precipitation_quality,r.quality)='valid' THEN r.precipitation_mm::float8 END AS precipitation_mm FROM stations s JOIN municipalities m ON m.id=s.municipality_id JOIN LATERAL(SELECT * FROM weather_readings WHERE station_id=s.id AND observed_at BETWEEN now()-interval '3 hours' AND now() AND quality='valid' ORDER BY observed_at DESC LIMIT 1) r ON true WHERE s.municipality_id=$1 AND s.enabled AND s.provider='inmet' AND s.consecutive_failures=0 AND ST_Covers(m.boundary,s.location) ORDER BY r.observed_at DESC,s.id LIMIT 1`,[m.id])).rows[0]??null;
  // Only the explicitly known pilot composition is associated with the main river.
  // Never assume an arbitrary composition is representative of another municipality.
  const flow=(await this.db.query(`WITH composition AS (SELECT c.id,c.name,c.station_codes,c.margin_m3_s FROM hydro_compositions c WHERE c.municipality_id=$1 AND c.archived_at IS NULL AND c.id=(SELECT public_flow_composition_id FROM municipalities WHERE id=$1)),
   readings AS (SELECT c.id,c.name,c.margin_m3_s,cardinality(c.station_codes) AS expected,t.id AS target_id,t.enabled,t.last_error,v.observed_at,v.discharge_m3_s,v.discharge_quality
   FROM composition c CROSS JOIN LATERAL unnest(c.station_codes) AS codes(code)
   LEFT JOIN ana_targets t ON t.municipality_id=$1 AND t.station_code=codes.code AND t.archived_at IS NULL
   LEFT JOIN LATERAL(SELECT observed_at,discharge_m3_s,discharge_quality FROM ana_telemetry WHERE target_id=t.id ORDER BY observed_at DESC LIMIT 1)v ON true)
   SELECT name,margin_m3_s,CASE WHEN count(DISTINCT target_id)=expected AND count(*)=expected AND bool_and(coalesce(enabled,false) AND last_error IS NULL AND coalesce(discharge_quality='Dado aprovado',false) AND discharge_m3_s IS NOT NULL AND coalesce(observed_at BETWEEN now()-interval '2 hours' AND now(),false)) AND min(observed_at)=max(observed_at) THEN sum(discharge_m3_s)::float8 END AS measured_sum_m3_s,
   CASE WHEN count(DISTINCT target_id)=expected AND count(*)=expected AND bool_and(coalesce(enabled,false) AND last_error IS NULL AND coalesce(discharge_quality='Dado aprovado',false) AND discharge_m3_s IS NOT NULL AND coalesce(observed_at BETWEEN now()-interval '2 hours' AND now(),false)) AND min(observed_at)=max(observed_at) THEN max(observed_at) END AS observed_at FROM readings GROUP BY id,name,margin_m3_s,expected`,[m.id])).rows[0]??null;
  return {municipality:{ibge_code:m.ibge_code,name:m.name,state:m.state,main_river:m.main_river},weather:{observation,forecast:forecast?{status:forecastFresh?'available':'stale',fetchedAt:forecast.fetched_at,current:forecastFresh?hours[0]??null:null,daily:forecastFresh?daily:[]}:null},river:flow?{name:flow.name,marginM3s:flow.margin_m3_s,measuredSumM3s:flow.measured_sum_m3_s,estimatedM3s:flow.measured_sum_m3_s===null?null:flow.measured_sum_m3_s+flow.margin_m3_s,observedAt:flow.observed_at}:null,risk:{status:'not_assessed',message:'Risco indeterminado: não há limite de transbordamento homologado para publicação. Ausência de avaliação não significa segurança.'}};
 }
}
