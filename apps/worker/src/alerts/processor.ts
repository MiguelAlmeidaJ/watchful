import type { Pool,PoolClient } from 'pg';
import { evaluate,fingerprint } from './risk-engine';
export class AlertProcessor{
 constructor(private readonly pool:Pool){}
 private async tx<T>(fn:(c:PoolClient)=>Promise<T>){const c=await this.pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async assess(id:string){
  await this.tx(async c=>{
   const initial=(await c.query('SELECT organization_id,area_id FROM risk_rules WHERE id=$1',[id])).rows[0];if(!initial)return;
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[initial.organization_id+':'+initial.area_id]);
   const r=(await c.query(`SELECT r.*,a.municipality_id,a.classification,a.updated_at AS area_updated_at,s.enabled AS station_enabled,s.last_success_at,s.consecutive_failures,s.municipality_id AS station_municipality,date_trunc('hour',now(),'UTC') AS window_end FROM risk_rules r JOIN risk_areas a ON a.id=r.area_id JOIN stations s ON s.id=r.station_id JOIN organization_municipalities om ON om.organization_id=r.organization_id AND om.municipality_id=a.municipality_id WHERE r.id=$1 AND r.active AND a.active FOR SHARE OF a,s`,[id])).rows[0];if(!r)return;
   const rows=(await c.query(`SELECT id,observed_at,precipitation_mm FROM hourly_precipitation
    WHERE station_id=$1 AND observed_at>$2::timestamptz-make_interval(hours=>$3) AND observed_at<=$2
    AND precipitation_quality='valid' ORDER BY observed_at`,[r.station_id,r.window_end,r.window_hours])).rows;
   const readings=rows.map(x=>({id:String(x.id),mm:Number(x.precipitation_mm),observedAt:new Date(x.observed_at).toISOString()}));
   const eligible=r.classification!=='unknown'&&r.station_enabled&&r.station_municipality===r.municipality_id&&r.consecutive_failures===0&&!!r.last_success_at&&Date.now()-Date.parse(r.last_success_at)<=180*60000;
   const result=evaluate({hours:r.window_hours,readings,eligible,attention:Number(r.attention_mm),warning:Number(r.warning_mm),severe:Number(r.severe_mm)});
   const evidence={...result,readings,eligible,stationId:r.station_id,areaUpdatedAt:r.area_updated_at,classification:r.classification,windowEnd:r.window_end,ruleVersion:r.version};
   const assessment=(await c.query('INSERT INTO risk_assessments(rule_id,window_end,level,evidence,fingerprint) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id',[id,r.window_end,result.level,JSON.stringify(evidence),fingerprint(evidence)])).rows[0];
   if(!assessment||result.level==='normal'||result.level==='unknown')return;
   const a=(await c.query(`INSERT INTO alerts(organization_id,municipality_id,area_id,assessment_id,origin,severity,title,message,source,geometry,starts_at,expires_at)
    SELECT $1,municipality_id,id,$3,'calculated',$4,'Avaliação interna de precipitação','Indicador calculado; requer revisão técnica. Não é aviso oficial.','Watchful',boundary,now(),now()+interval '3 hours' FROM risk_areas WHERE id=$2 ON CONFLICT DO NOTHING RETURNING id`,[r.organization_id,r.area_id,assessment.id,result.level])).rows[0];
   if(a)await c.query("INSERT INTO alert_events(alert_id,event_type,details) VALUES($1,'created',$2)",[a.id,JSON.stringify({assessmentId:assessment.id})]);
  });
 }
 async expire(){
  await this.tx(async c=>{
   const rows=(await c.query("SELECT id,status FROM alerts WHERE expires_at<=now() AND status IN ('draft','approved','published') ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED")).rows;
   for(const a of rows){
    await c.query("UPDATE alerts SET status='expired',updated_at=now() WHERE id=$1",[a.id]);
    const e=(await c.query("INSERT INTO alert_events(alert_id,event_type) VALUES($1,'expired') RETURNING id",[a.id])).rows[0]!;
    if(a.status==='published')await c.query('INSERT INTO event_outbox(alert_event_id) VALUES($1)',[e.id]);
   }
  });
 }
 async deliver(){
  await this.tx(async c=>{
   const events=(await c.query('SELECT id,alert_event_id FROM event_outbox WHERE processed_at IS NULL ORDER BY created_at LIMIT 50 FOR UPDATE SKIP LOCKED')).rows;
   for(const e of events){
    await c.query(`INSERT INTO notifications(alert_event_id,user_id)
    SELECT ev.id,s.user_id FROM alert_events ev JOIN alerts a ON a.id=ev.alert_id JOIN subscriptions s ON s.organization_id=a.organization_id AND s.municipality_id=a.municipality_id JOIN users u ON u.id=s.user_id AND u.active JOIN memberships m ON m.user_id=s.user_id AND m.organization_id=s.organization_id JOIN organization_municipalities om ON om.organization_id=s.organization_id AND om.municipality_id=s.municipality_id
    WHERE ev.id=$1 AND s.enabled AND ((ev.event_type='published' AND a.status='published' AND a.starts_at<=now() AND a.expires_at>now() AND (s.location IS NULL OR ST_Covers(a.geometry,s.location))) OR (ev.event_type IN ('cancelled','expired') AND EXISTS(SELECT 1 FROM notifications n JOIN alert_events previous ON previous.id=n.alert_event_id WHERE previous.alert_id=a.id AND previous.event_type='published' AND n.user_id=s.user_id)))
    ON CONFLICT DO NOTHING`,[e.alert_event_id]);
    await c.query('UPDATE event_outbox SET processed_at=now(),attempts=attempts+1 WHERE id=$1',[e.id]);
   }
  });
 }
}
