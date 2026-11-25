import { Injectable,Inject,ForbiddenException,NotFoundException,ConflictException,BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { Database } from '../../common/database';
import { audit } from '../../common/audit';
import type { Actor } from '../auth/auth.guard';
@Injectable()
export class AlertsService {
 constructor(@Inject(Database) readonly db:Database){}
 async access(c:PoolClient,actor:Actor,org:string,municipality:string,roles:string[]|null=null){
  const row=(await c.query(`SELECT 1 FROM organization_municipalities om WHERE om.organization_id=$1 AND om.municipality_id=$2 AND ($3::boolean OR EXISTS(SELECT 1 FROM memberships WHERE organization_id=$1 AND user_id=$4 AND ($5::text[] IS NULL OR role=ANY($5))))`,[org,municipality,actor.platformAdmin,actor.id,roles])).rows[0];
  if(!row)throw new ForbiddenException();
 }
 async event(c:PoolClient,id:string,type:string,actor:string|null,details:object={}){
  const row=(await c.query('INSERT INTO alert_events(alert_id,event_type,actor_id,details) VALUES($1,$2,$3,$4) RETURNING id',[id,type,actor,JSON.stringify(details)])).rows[0]!;
  if(['published','cancelled','expired'].includes(type))await c.query('INSERT INTO event_outbox(alert_event_id) VALUES($1)',[row.id]);
 }
 async createRule(actor:Actor,v:{organizationId:string;areaId:string;stationId:string;windowHours:number;attentionMm:number;warningMm:number;severeMm:number;rationale:string}){
  return this.db.transaction(async c=>{
   const a=(await c.query('SELECT municipality_id FROM risk_areas WHERE id=$1 AND active',[v.areaId])).rows[0];if(!a)throw new NotFoundException();
   await this.access(c,actor,v.organizationId,a.municipality_id,['admin']);
   if(!(await c.query('SELECT 1 FROM stations WHERE id=$1 AND municipality_id=$2 AND enabled',[v.stationId,a.municipality_id])).rowCount)throw new BadRequestException('Estação incompatível com território');
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[v.organizationId+':'+v.areaId]);
   const row=(await c.query(`INSERT INTO risk_rules(organization_id,area_id,station_id,version,window_hours,attention_mm,warning_mm,severe_mm,rationale,created_by)
    SELECT $1,$2,$3,COALESCE(max(version),0)+1,$4,$5,$6,$7,$8,$9 FROM risk_rules WHERE organization_id=$1 AND area_id=$2 RETURNING id,version,active`,[v.organizationId,v.areaId,v.stationId,v.windowHours,v.attentionMm,v.warningMm,v.severeMm,v.rationale,actor.id])).rows[0]!;
   await audit(c,actor.id,'risk.rule.create',row.id,v.organizationId);return row;
  });
 }
 async approveRule(actor:Actor,id:string){
  return this.db.transaction(async c=>{
   const initial=(await c.query('SELECT organization_id,area_id FROM risk_rules WHERE id=$1',[id])).rows[0];if(!initial)throw new NotFoundException();
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[initial.organization_id+':'+initial.area_id]);
   const rule=(await c.query('SELECT r.*,a.municipality_id,a.active AS area_active FROM risk_rules r JOIN risk_areas a ON a.id=r.area_id WHERE r.id=$1 FOR UPDATE OF r',[id])).rows[0]!;
   await this.access(c,actor,rule.organization_id,rule.municipality_id,['admin']);
   if(rule.created_by===actor.id||rule.approved_at||!rule.area_active)throw new ConflictException('Revisão independente necessária ou regra indisponível');
   if((await c.query('SELECT 1 FROM risk_rules WHERE organization_id=$1 AND area_id=$2 AND version>$3 AND approved_at IS NOT NULL',[rule.organization_id,rule.area_id,rule.version])).rowCount)throw new ConflictException('Versão superada');
   await c.query('UPDATE risk_rules SET active=false WHERE organization_id=$1 AND area_id=$2 AND active',[rule.organization_id,rule.area_id]);
   await c.query('UPDATE risk_rules SET active=true,approved_by=$2,approved_at=now() WHERE id=$1',[id,actor.id]);
   await audit(c,actor.id,'risk.rule.approve',id,rule.organization_id);return {id,active:true};
  });
 }
 async createAlert(actor:Actor,v:{organizationId:string;areaId:string;severity:string;title:string;message:string;startsAt:string;expiresAt:string;origin:'manual'|'official';source:string;externalId?:string}){
  return this.db.transaction(async c=>{
   const area=(await c.query('SELECT municipality_id FROM risk_areas WHERE id=$1 AND active FOR SHARE',[v.areaId])).rows[0];if(!area)throw new NotFoundException();
   await this.access(c,actor,v.organizationId,area.municipality_id,['admin','operator']);
   if(v.origin==='official'&&!actor.platformAdmin)throw new ForbiddenException();
   const row=(await c.query(`INSERT INTO alerts(organization_id,municipality_id,area_id,origin,severity,title,message,source,external_id,geometry,starts_at,expires_at,created_by)
    SELECT $1,municipality_id,id,$3,$4,$5,$6,$7,$8,boundary,$9,$10,$11 FROM risk_areas WHERE id=$2 ON CONFLICT DO NOTHING RETURNING id,status`,[v.organizationId,v.areaId,v.origin,v.severity,v.title,v.message,v.source,v.externalId??null,v.startsAt,v.expiresAt,actor.id])).rows[0];
   if(!row)throw new ConflictException('Alerta duplicado');
   await this.event(c,row.id,'created',actor.id);await audit(c,actor.id,'alert.create',row.id,v.organizationId);return row;
  });
 }
 async transition(actor:Actor,id:string,action:'approve'|'publish'|'cancel'){
  return this.db.transaction(async c=>{
   const a=(await c.query('SELECT * FROM alerts WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!a)throw new NotFoundException();
   await this.access(c,actor,a.organization_id,a.municipality_id,['admin']);
   const now=Date.now();let status:string;
   if(action==='approve'){
    if(a.status!=='draft'||a.created_by===actor.id||Date.parse(a.expires_at)<=now)throw new ConflictException('Revisão independente necessária ou alerta vencido');
    status='approved';
   }else if(action==='publish'){
    if(process.env.ALERT_INTERNAL_PUBLICATION_ENABLED!=='true')throw new ForbiddenException('Publicação interna desabilitada');
    if(a.status!=='approved'||!a.approved_by||Date.parse(a.starts_at)>now||Date.parse(a.expires_at)<=now)throw new ConflictException('Alerta não elegível');
    if(a.origin==='calculated')throw new ForbiddenException('Alertas calculados permanecem em revisão nesta fase');
    status='published';
   }else{
    if(!['draft','approved','published'].includes(a.status))throw new ConflictException('Transição inválida');status='cancelled';
   }
   const row=(await c.query("UPDATE alerts SET status=$2,approved_by=CASE WHEN $2='approved' THEN $3 ELSE approved_by END,updated_at=now() WHERE id=$1 RETURNING id,status",[id,status,actor.id])).rows[0];
   if(status==='cancelled'&&a.status!=='published'){await c.query("INSERT INTO alert_events(alert_id,event_type,actor_id) VALUES($1,'cancelled',$2)",[id,actor.id]);}
   else await this.event(c,id,status,actor.id);
   await audit(c,actor.id,'alert.'+status,id,a.organization_id);return row;
  });
 }
}
