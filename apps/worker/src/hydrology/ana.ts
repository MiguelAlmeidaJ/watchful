import type {Pool} from 'pg';
const endpoints=['https://www.ana.gov.br/telemetria1ws/ServiceANA.asmx/DadosHidrometeorologicosGerais','https://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicosGerais'];
export function parseTelemetry(xml:string,code:string,now=Date.now()){
 if(/<!DOCTYPE|<!ENTITY/i.test(xml)||!/<DataTable\b/.test(xml)||!/<\/DataTable>\s*$/.test(xml))throw Error('INVALID_XML');
 const section=xml.match(/<DocumentElement(?:\s[^>]*)?>([\s\S]*?)<\/DocumentElement>/)?.[1];
 if(!section)throw Error('NO_DATA');
 const rows=new Map<string,{observedAt:string;discharge:number|null;dischargeQuality:string|null;level:number|null;levelQuality:string|null}>();
 for(const match of section.matchAll(/<DadosHidrometereologicos(?:\s[^>]*)?>([\s\S]*?)<\/DadosHidrometereologicos>/g)){
  const row=match[1]!;const field=(name:string)=>row.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([^<]*)</'+name+'>'))?.[1]?.trim()||null;
  if(field('CodEstacao')!==code)throw Error('STATION_MISMATCH');
  const raw=field('DataHora');if(!raw||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw))throw Error('INVALID_DATE');
  const stamp=Date.parse(raw.replace(' ','T')+'-03:00');if(!Number.isFinite(stamp)||stamp>now||new Date(stamp-10800000).toISOString().slice(0,19)!==raw.replace(' ','T'))throw Error('INVALID_DATE');
  const num=(v:string|null)=>v!==null&&/^-?\d+(?:[.,]\d+)?$/.test(v)&&Number.isFinite(Number(v.replace(',','.')))?Number(v.replace(',','.')):null;
  const q=field('CQ_VazaoFinal'),lq=field('CQ_NivelFinal'),d=num(field('VazaoFinal')),l=num(field('NivelFinal'));
  const observedAt=new Date(stamp).toISOString();const value={observedAt,discharge:q==='Dado aprovado'&&d!==null&&d>=0?d:null,dischargeQuality:q,level:l,levelQuality:lq};
  const previous=rows.get(observedAt);if(previous&&JSON.stringify(previous)!==JSON.stringify(value))throw Error('CONFLICTING_ROWS');rows.set(observedAt,value);
 }
 if(!rows.size||rows.size>1000||![...rows.values()].some(r=>r.discharge!==null||r.level!==null))throw Error('NO_DATA');
 return [...rows.values()];
}
async function collect(code:string){
 const date=(t:number)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}).format(t);
 const failures:string[]=[];
 for(const [index,endpoint] of endpoints.entries()){try{
  const url=new URL(endpoint);url.searchParams.set('codEstacao',code);url.searchParams.set('dataInicio',date(Date.now()-86400000));url.searchParams.set('dataFim',date(Date.now()));
  const res=await fetch(url,{signal:AbortSignal.timeout(12000),redirect:'error'});if(!res.ok)throw Error('HTTP_'+res.status);if(!res.body)throw Error('EMPTY_BODY');
  const reader=res.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2000000){await reader.cancel();throw Error('SIZE');}chunks.push(value);}}finally{reader.releaseLock();}
  return parseTelemetry(Buffer.concat(chunks).toString('utf8'),code);
 }catch(e){const message=e instanceof Error?e.message:'';const code=/^(INVALID_XML|NO_DATA|STATION_MISMATCH|INVALID_DATE|CONFLICTING_ROWS|SIZE|EMPTY_BODY|HTTP_[0-9]{3})$/.test(message)?message:e instanceof Error&&['TimeoutError','AbortError'].includes(e.name)?'TIMEOUT':'NETWORK_OR_READ_ERROR';failures.push('ENDPOINT_'+(index+1)+'_'+code);}}
 throw Error(failures.join(';'));
}
export async function pollAna(pool:Pool){
 const c=await pool.connect();let locked=false;
 try{
  locked=Boolean((await c.query('SELECT pg_try_advisory_lock(827351) AS locked')).rows[0]?.locked);if(!locked)return;
  const target=(await c.query('SELECT id,station_code FROM ana_targets WHERE enabled AND archived_at IS NULL AND next_due<=now() ORDER BY next_due LIMIT 1')).rows[0];if(!target)return;
  await c.query("UPDATE ana_targets SET last_attempt_at=now(),next_due=now()+interval '15 minutes' WHERE id=$1",[target.id]);
  let stage='FETCH';
  try{
   const rows=await collect(target.station_code);
   stage='DATABASE';
   await c.query('BEGIN');
   const active=(await c.query('SELECT id FROM ana_targets WHERE id=$1 AND enabled AND archived_at IS NULL FOR UPDATE',[target.id])).rowCount;if(!active){await c.query('ROLLBACK');return;}
   for(const row of rows)await c.query(`INSERT INTO ana_telemetry(target_id,observed_at,discharge_m3_s,discharge_quality,level_raw,level_quality) VALUES($1,$2,$3,$4,$5,$6)
   ON CONFLICT(target_id,observed_at) DO UPDATE SET discharge_m3_s=excluded.discharge_m3_s,discharge_quality=excluded.discharge_quality,level_raw=excluded.level_raw,level_quality=excluded.level_quality,fetched_at=now()`,[target.id,row.observedAt,row.discharge,row.dischargeQuality,row.level,row.levelQuality]);
   await c.query('UPDATE ana_targets SET last_success_at=now(),last_error=NULL,records_count=$2 WHERE id=$1',[target.id,rows.length]);await c.query('COMMIT');
  }catch(e){if(stage==='DATABASE')await c.query('ROLLBACK');const detail=stage==='FETCH'&&e instanceof Error?e.message:'DATABASE_WRITE_FAILED';await c.query('UPDATE ana_targets SET last_error=$2 WHERE id=$1',[target.id,detail]);console.error(JSON.stringify({event:'ana.collection.failed',station:target.station_code,detail}));}
 }finally{try{if(locked)await c.query('SELECT pg_advisory_unlock(827351)');}finally{c.release();}}
}
