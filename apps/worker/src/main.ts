import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Queue,Worker } from 'bullmq';
import { Pool } from 'pg';
import { AlertProcessor } from './alerts/processor';
import { Ingestion, type TargetKind } from './weather/ingestion';
config({path:resolve(__dirname,'../../../.env')});
async function bootstrap(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
 const redis=new URL(process.env.REDIS_QUEUE_URL??'redis://localhost:6380');
 const connection={host:redis.hostname,port:Number(redis.port||6379),username:redis.username?decodeURIComponent(redis.username):undefined,password:redis.password?decodeURIComponent(redis.password):undefined,db:Number(redis.pathname.slice(1)||0),...(redis.protocol==='rediss:'?{tls:{}}:{})};
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:6,connectionTimeoutMillis:5000});
 const queue=new Queue('weather.ingestion',{connection});
 const ingestion=new Ingestion(pool);
 const worker=new Worker('weather.ingestion',async job=>{
  if(process.env.WEATHER_INGESTION_ENABLED!=='true')return;
  if(job.name==='dispatch-manual'){
   const c=await pool.connect();try{await c.query('BEGIN');const rows=(await c.query('SELECT id,target_kind,target_id FROM weather_sync_requests WHERE dispatched_at IS NULL ORDER BY requested_at LIMIT 20 FOR UPDATE SKIP LOCKED')).rows;
    for(const row of rows){await queue.add('collect',{kind:row.target_kind,id:row.target_id},{jobId:'manual-'+row.id,attempts:3,backoff:{type:'exponential',delay:30000},removeOnComplete:{age:172800,count:10000},removeOnFail:{age:604800,count:10000}});await c.query('UPDATE weather_sync_requests SET dispatched_at=now() WHERE id=$1',[row.id]);}
    await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}return;
  }
  if(job.name==='schedule-observations'||job.name==='schedule-forecasts'){
   const kind:TargetKind=job.name==='schedule-observations'?'station':'forecast_location';
   const table=kind==='station'?'stations':'forecast_locations';
   const targets=(await pool.query('SELECT id FROM '+table+" WHERE enabled"+(kind==='station'?" AND lower(provider)='inmet'":""))).rows;
   const bucket=Math.floor(Date.now()/(kind==='station'?900000:3600000));
   for(const target of targets)await queue.add('collect',{kind,id:target.id},{jobId:kind+'-'+target.id+'-'+bucket,attempts:3,backoff:{type:'exponential',delay:30000},removeOnComplete:{age:172800,count:10000},removeOnFail:{age:604800,count:10000}});
   return;
  }
  if(job.name!=='collect'||!['station','forecast_location'].includes(job.data.kind)||typeof job.data.id!=='string')throw new Error('INVALID_JOB');
  await ingestion.run(job.data.kind,job.data.id);
 },{connection,concurrency:3,limiter:{max:10,duration:60000}});
 worker.on('failed',(job,error)=>console.error(JSON.stringify({event:'weather.job.failed',jobId:job?.id,code:error.message})));
 worker.on('error',()=>console.error(JSON.stringify({event:'weather.worker.error'})));
 await queue.waitUntilReady();await worker.waitUntilReady();
 if(process.env.WEATHER_INGESTION_ENABLED==='true'){
  await queue.upsertJobScheduler('manual-v1',{every:15000},{name:'dispatch-manual',data:{},opts:{removeOnComplete:30,removeOnFail:30}});
  await queue.upsertJobScheduler('observations-v1',{every:900000},{name:'schedule-observations',data:{},opts:{removeOnComplete:100,removeOnFail:100}});
  await queue.upsertJobScheduler('forecasts-v1',{every:3600000},{name:'schedule-forecasts',data:{},opts:{removeOnComplete:100,removeOnFail:100}});
  // First collection is queued on startup, using the same deduplication bucket.
  for(const kind of ['station','forecast_location'] as const){const table=kind==='station'?'stations':'forecast_locations';const targets=(await pool.query('SELECT id FROM '+table+" WHERE enabled"+(kind==='station'?" AND lower(provider)='inmet'":""))).rows;const bucket=Math.floor(Date.now()/(kind==='station'?900000:3600000));for(const t of targets)await queue.add('collect',{kind,id:t.id},{jobId:kind+'-'+t.id+'-'+bucket,attempts:3,backoff:{type:'exponential',delay:30000},removeOnComplete:{age:172800,count:10000},removeOnFail:{age:604800,count:10000}});}
 }else{
  await queue.removeJobScheduler('manual-v1');await queue.removeJobScheduler('observations-v1');await queue.removeJobScheduler('forecasts-v1');
 }
 const alertQueue=new Queue('alerts.processing',{connection});
 const processor=new AlertProcessor(pool);
 const alertWorker=new Worker('alerts.processing',async job=>{
  if(job.name==='maintenance'){await processor.expire();await processor.deliver();return;}
  if(process.env.RISK_EVALUATION_ENABLED!=='true')return;
  if(job.name==='schedule-risk'){
   const rules=(await pool.query('SELECT id FROM risk_rules WHERE active')).rows;
   const bucket=Math.floor(Date.now()/900000);
   for(const rule of rules)await alertQueue.add('assess',{id:rule.id},{jobId:'risk-'+rule.id+'-'+bucket,attempts:3,backoff:{type:'exponential',delay:30000},removeOnComplete:{age:86400,count:10000},removeOnFail:{age:604800,count:10000}});
   return;
  }
  if(job.name==='assess'&&typeof job.data.id==='string')await processor.assess(job.data.id);
 },{connection,concurrency:2});
 alertWorker.on('error',()=>console.error('alert.worker.error'));
 alertWorker.on('failed',(job)=>console.error(JSON.stringify({event:'alert.job.failed',id:job?.id})));
 await alertQueue.waitUntilReady();await alertWorker.waitUntilReady();
 await alertQueue.upsertJobScheduler('alert-maintenance-v1',{every:60000},{name:'maintenance',data:{},opts:{removeOnComplete:100,removeOnFail:100}});
 if(process.env.RISK_EVALUATION_ENABLED==='true')await alertQueue.upsertJobScheduler('risk-v1',{every:900000},{name:'schedule-risk',data:{},opts:{removeOnComplete:100,removeOnFail:100}});
 else await alertQueue.removeJobScheduler('risk-v1');
 console.log('Watchful weather and alert workers ready');
 let closing=false;
 const shutdown=async()=>{if(closing)return;closing=true;await Promise.all([worker.close(),alertWorker.close()]);await Promise.all([queue.close(),alertQueue.close()]);await pool.end();};
 process.once('SIGINT',()=>void shutdown());process.once('SIGTERM',()=>void shutdown());
}
bootstrap().catch(error=>{console.error(error instanceof Error?error.name:'Startup failed');process.exit(1);});
