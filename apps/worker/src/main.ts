import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Queue,Worker } from 'bullmq';
import { Pool } from 'pg';
import { pollAna } from './hydrology/ana';
import { AlertProcessor } from './alerts/processor';
import { Ingestion, type TargetKind } from './weather/ingestion';
config({path:resolve(__dirname,'../../../.env')});

const weatherSchedules = {
 station: { scheduler: 'observations-v1', job: 'schedule-observations', interval: 900000, flag: 'WEATHER_OBSERVATIONS_ENABLED',
  targets: "SELECT id FROM stations WHERE enabled AND lower(provider)='inmet'" },
 forecast_location: { scheduler: 'forecasts-v1', job: 'schedule-forecasts', interval: 3600000, flag: 'WEATHER_FORECASTS_ENABLED',
  targets: 'SELECT id FROM forecast_locations WHERE enabled' }
} as const;

const collectionOptions = {
 attempts: 3, backoff: { type: 'exponential', delay: 30000 },
 removeOnComplete: { age: 172800, count: 10000 }, removeOnFail: { age: 604800, count: 10000 }
};

async function bootstrap(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
 const redis=new URL(process.env.REDIS_QUEUE_URL??'redis://localhost:6380');
 const connection={host:redis.hostname,port:Number(redis.port||6379),username:redis.username?decodeURIComponent(redis.username):undefined,password:redis.password?decodeURIComponent(redis.password):undefined,db:Number(redis.pathname.slice(1)||0),...(redis.protocol==='rediss:'?{tls:{}}:{})};
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:6,connectionTimeoutMillis:5000});
 const queue=new Queue('weather.ingestion',{connection});
 const ingestion=new Ingestion(pool);
 const kinds = Object.keys(weatherSchedules) as TargetKind[];
 const activeKinds = process.env.WEATHER_INGESTION_ENABLED === 'true'
  ? kinds.filter(kind => (process.env[weatherSchedules[kind].flag] ?? 'true') === 'true')
  : [];

 const schedule = async (kind: TargetKind) => {
  const { targets, interval } = weatherSchedules[kind];
  const bucket = Math.floor(Date.now() / interval);
  const result = await pool.query<{ id: string }>(targets);
  for (const { id } of result.rows) {
   await queue.add('collect', { kind, id }, { ...collectionOptions, jobId: `${kind}-${id}-${bucket}` });
  }
 };

 const worker=new Worker('weather.ingestion',async job=>{
  if (!activeKinds.length) return;
  if(job.name==='dispatch-manual'){
   const c=await pool.connect();try{await c.query('BEGIN');const rows=(await c.query(`SELECT id,target_kind,target_id
    FROM weather_sync_requests WHERE dispatched_at IS NULL AND target_kind=ANY($1::text[])
    ORDER BY requested_at LIMIT 20 FOR UPDATE SKIP LOCKED`, [activeKinds])).rows;
    for(const row of rows){await queue.add('collect',{kind:row.target_kind,id:row.target_id},{...collectionOptions,jobId:'manual-'+row.id});await c.query('UPDATE weather_sync_requests SET dispatched_at=now() WHERE id=$1',[row.id]);}
    await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}return;
  }
  const scheduledKind = kinds.find(kind => weatherSchedules[kind].job === job.name);
  if (scheduledKind) {
   if (activeKinds.includes(scheduledKind)) await schedule(scheduledKind);
   return;
  }
  const { kind, id } = job.data;
  if (job.name !== 'collect' || !kinds.includes(kind) || typeof id !== 'string') throw new Error('INVALID_JOB');
  if (activeKinds.includes(kind)) await ingestion.run(kind, id);
 },{connection,concurrency:3,limiter:{max:10,duration:60000}});
 worker.on('failed',(job,error)=>console.error(JSON.stringify({event:'weather.job.failed',jobId:job?.id,code:error.message})));
 worker.on('error',()=>console.error(JSON.stringify({event:'weather.worker.error'})));
 await queue.waitUntilReady();await worker.waitUntilReady();
 if (activeKinds.length) {
  await queue.upsertJobScheduler('manual-v1',{every:15000},{name:'dispatch-manual',data:{},opts:{removeOnComplete:30,removeOnFail:30}});
 } else {
  await queue.removeJobScheduler('manual-v1');
 }
 for (const kind of kinds) {
  const { scheduler, job, interval } = weatherSchedules[kind];
  if (activeKinds.includes(kind)) {
   await queue.upsertJobScheduler(scheduler, { every: interval }, { name: job, data: {}, opts: { removeOnComplete: 100, removeOnFail: 100 } });
   await schedule(kind);
  } else {
   await queue.removeJobScheduler(scheduler);
  }
 }
 const alertQueue=new Queue('alerts.processing',{connection});
 const processor=new AlertProcessor(pool);
 const alertWorker=new Worker('alerts.processing',async job=>{
  if(job.name==='ana-poll'){if(process.env.ANA_INGESTION_ENABLED==='true')await pollAna(pool);return;}
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
 if(process.env.ANA_INGESTION_ENABLED==='true')await alertQueue.upsertJobScheduler('ana-poll-v1',{every:60000},{name:'ana-poll',data:{},opts:{removeOnComplete:30,removeOnFail:30}});else await alertQueue.removeJobScheduler('ana-poll-v1');
 await alertQueue.upsertJobScheduler('alert-maintenance-v1',{every:60000},{name:'maintenance',data:{},opts:{removeOnComplete:100,removeOnFail:100}});
 if(process.env.RISK_EVALUATION_ENABLED==='true')await alertQueue.upsertJobScheduler('risk-v1',{every:900000},{name:'schedule-risk',data:{},opts:{removeOnComplete:100,removeOnFail:100}});
 else await alertQueue.removeJobScheduler('risk-v1');
 console.log('Watchful weather and alert workers ready');
 let closing=false;
 const shutdown=async()=>{if(closing)return;closing=true;await Promise.all([worker.close(),alertWorker.close()]);await Promise.all([queue.close(),alertQueue.close()]);await pool.end();};
 process.once('SIGINT',()=>void shutdown());process.once('SIGTERM',()=>void shutdown());
}
bootstrap().catch(error=>{console.error(error instanceof Error?error.name:'Startup failed');process.exit(1);});
