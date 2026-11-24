import type { Pool,PoolClient } from 'pg';
import { observations,forecasts } from './registry';
import type { StationTarget,ForecastTarget } from './types';
export type TargetKind='station'|'forecast_location';
export class Ingestion {
 constructor(private readonly pool:Pool){}
 async run(kind:TargetKind,id:string){
  const c=await this.pool.connect();
  const table=kind==='station'?'stations':'forecast_locations';
  let runId:string|undefined;let locked=false;
  try{
   locked=(await c.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[kind+':'+id])).rows[0]?.locked===true;
   if(!locked)return;
   const target=(await c.query('SELECT *,ST_Y(location) AS latitude,ST_X(location) AS longitude FROM '+table+' WHERE id=$1 AND enabled',[id])).rows[0];
   if(!target)return;
   const provider=kind==='station'?String(target.provider).toLowerCase():'open-meteo';
   runId=(await c.query("INSERT INTO ingestion_runs(provider,target_kind,target_id,status) VALUES($1,$2,$3,'running') RETURNING id",[provider,kind,id])).rows[0]!.id;
   await c.query('UPDATE '+table+' SET last_attempt_at=now() WHERE id=$1',[id]);
   const now=new Date();
   if(kind==='station'){
    const adapter=observations.get(provider);if(!adapter)throw new Error('UNSUPPORTED_PROVIDER');
    const rows=await adapter.collect(target as StationTarget,now);
    await this.persist(c,async()=>{
     for (const row of rows) await c.query(`INSERT INTO weather_readings
      (station_id, observed_at, precipitation_mm, temperature_c, humidity_pct, wind_kmh, gust_kmh, pressure_hpa, quality, precipitation_quality, source_payload)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (station_id, observed_at) DO UPDATE SET
        precipitation_mm = excluded.precipitation_mm, temperature_c = excluded.temperature_c,
        humidity_pct = excluded.humidity_pct, wind_kmh = excluded.wind_kmh, gust_kmh = excluded.gust_kmh,
        pressure_hpa = excluded.pressure_hpa, quality = excluded.quality,
        precipitation_quality = excluded.precipitation_quality, source_payload = excluded.source_payload, ingested_at = now()
      WHERE (weather_readings.quality = 'missing' OR excluded.quality = 'valid'
             OR (weather_readings.quality = 'suspect' AND excluded.quality = 'suspect'))
        AND NOT (
          effective_precipitation_quality(weather_readings.precipitation_mm, weather_readings.precipitation_quality,
             weather_readings.quality) = 'valid'
          AND excluded.precipitation_quality <> 'valid'
        )
        AND (weather_readings.precipitation_mm, weather_readings.temperature_c, weather_readings.humidity_pct,
             weather_readings.wind_kmh, weather_readings.gust_kmh, weather_readings.pressure_hpa,
             weather_readings.quality, weather_readings.precipitation_quality, weather_readings.source_payload)
          IS DISTINCT FROM (excluded.precipitation_mm, excluded.temperature_c, excluded.humidity_pct,
             excluded.wind_kmh, excluded.gust_kmh, excluded.pressure_hpa, excluded.quality,
             excluded.precipitation_quality, excluded.source_payload)`, [id, row.observedAt, row.precipitationMm,
       row.temperatureC, row.humidityPct, row.windKmh, row.gustKmh, row.pressureHpa, row.quality,
       row.precipitationQuality, JSON.stringify(row.raw)]);
     await this.finish(c,table,id,runId!,rows.filter(row => row.quality !== 'missing').length);
    });
   }else{
    const adapter=forecasts.get(provider);if(!adapter)throw new Error('UNSUPPORTED_PROVIDER');
    const rows=await adapter.collect(target as ForecastTarget);
    const fetchedAt=new Date();
    await this.persist(c,async()=>{
     for(const row of rows)await c.query(`INSERT INTO weather_forecasts(location_id,provider,fetched_at,valid_at,precipitation_mm,precipitation_probability_pct,temperature_c,humidity_pct,wind_kmh,gust_kmh)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,[id,provider,fetchedAt,row.validAt,row.precipitationMm,row.probabilityPct,row.temperatureC,row.humidityPct,row.windKmh,row.gustKmh]);
     await this.finish(c,table,id,runId!,rows.length);
    });
   }
  }catch(error){
   const code=error instanceof Error&&/^[A-Z0-9_]{1,80}$/.test(error.message)?error.message:'INGESTION_FAILED';
   if(runId)await this.persist(c,async()=>{
    await c.query("UPDATE ingestion_runs SET status='failed',finished_at=now(),error_code=$2 WHERE id=$1",[runId,code]);
    await c.query('UPDATE '+table+' SET last_error_at=now(),consecutive_failures=consecutive_failures+1 WHERE id=$1',[id]);
   });
   throw new Error(code);
  }finally{
   try{if(locked)await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[kind+':'+id]);}catch{c.release(true);throw new Error('LOCK_RELEASE_FAILED');}
   c.release();
  }
 }
 private async persist(c:PoolClient,fn:()=>Promise<void>){await c.query('BEGIN');try{await fn();await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}}
 private async finish(c:PoolClient,table:string,id:string,runId:string,count:number){
  await c.query("UPDATE ingestion_runs SET status='success',finished_at=now(),records_count=$2 WHERE id=$1",[runId,count]);
  await c.query('UPDATE '+table+' SET last_success_at=now(),consecutive_failures=0 WHERE id=$1',[id]);
 }
}
