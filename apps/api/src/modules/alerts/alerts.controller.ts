import { Body,Controller,Get,Post,Patch,Param,Query,Req,UseGuards,Inject,BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { parse,uuid } from '../../common/validation';
import { audit } from '../../common/audit';
import { AuthGuard,type AuthRequest } from '../auth/auth.guard';
import { position } from '../geo/geo.schemas';
import { AlertsService } from './alerts.service';
const text=z.string().trim().min(1).max(2000);
const date=z.string().datetime({offset:true});
const mm=z.number().finite().positive().max(10000);
const rule=z.object({organizationId:uuid,areaId:uuid,stationId:uuid,windowHours:z.union([z.literal(1),z.literal(6),z.literal(24),z.literal(72)]),attentionMm:mm,warningMm:mm,severeMm:mm,rationale:text}).strict().refine(v=>v.attentionMm<v.warningMm&&v.warningMm<v.severeMm);
const alert=z.object({organizationId:uuid,areaId:uuid,severity:z.enum(['attention','warning','severe']),title:z.string().trim().min(1).max(150),message:text,source:z.string().trim().min(1).max(150),externalId:z.string().trim().min(1).max(150).optional(),startsAt:date,expiresAt:date}).strict().refine(v=>Date.parse(v.expiresAt)>Math.max(Date.now(),Date.parse(v.startsAt))&&Date.parse(v.expiresAt)-Date.parse(v.startsAt)<=7*86400000);
@Controller()
@UseGuards(AuthGuard)
export class AlertsController{
 constructor(@Inject(AlertsService) private readonly svc:AlertsService){}
 @Post('risk-rules') createRule(@Req() req:AuthRequest,@Body() body:unknown){return this.svc.createRule(req.actor,parse(rule,body));}
 @Post('risk-rules/:id/approve') approveRule(@Req() req:AuthRequest,@Param('id') id:string){return this.svc.approveRule(req.actor,parse(uuid,id));}
 @Get('risk-rules') async rules(@Req() req:AuthRequest,@Query('organizationId') raw:string){
  const id=parse(uuid,raw);return (await this.svc.db.query(`SELECT r.* FROM risk_rules r JOIN risk_areas a ON a.id=r.area_id JOIN organization_municipalities om ON om.organization_id=r.organization_id AND om.municipality_id=a.municipality_id WHERE r.organization_id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM memberships WHERE organization_id=$1 AND user_id=$3)) ORDER BY r.created_at DESC LIMIT 100`,[id,req.actor.platformAdmin,req.actor.id])).rows;
 }
 @Get('risk-assessments') async assessments(@Req() req:AuthRequest,@Query('organizationId') raw:string){
  const id=parse(uuid,raw);return (await this.svc.db.query(`SELECT a.*,r.area_id,r.version FROM risk_assessments a JOIN risk_rules r ON r.id=a.rule_id JOIN risk_areas g ON g.id=r.area_id JOIN organization_municipalities om ON om.organization_id=r.organization_id AND om.municipality_id=g.municipality_id WHERE r.organization_id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM memberships WHERE organization_id=$1 AND user_id=$3)) ORDER BY a.evaluated_at DESC LIMIT 100`,[id,req.actor.platformAdmin,req.actor.id])).rows;
 }
 @Post('alerts') create(@Req() req:AuthRequest,@Body() body:unknown){return this.svc.createAlert(req.actor,{...parse(alert,body),origin:'manual'});}
 @Post('alerts/official-import') official(@Req() req:AuthRequest,@Body() body:unknown){
  const v=parse(alert,body);if(!v.externalId)throw new BadRequestException('Identificador oficial obrigatório');return this.svc.createAlert(req.actor,{...v,origin:'official'});
 }
 @Post('alerts/:id/approve') approve(@Req() req:AuthRequest,@Param('id') id:string){return this.svc.transition(req.actor,parse(uuid,id),'approve');}
 @Post('alerts/:id/publish') publish(@Req() req:AuthRequest,@Param('id') id:string){return this.svc.transition(req.actor,parse(uuid,id),'publish');}
 @Post('alerts/:id/cancel') cancel(@Req() req:AuthRequest,@Param('id') id:string){return this.svc.transition(req.actor,parse(uuid,id),'cancel');}
 @Get('alerts') async list(@Req() req:AuthRequest,@Query() query:unknown){
  const q=parse(z.object({organizationId:uuid,active:z.enum(['true','false']).default('false')}),query);
  return (await this.svc.db.query(`SELECT a.id,a.area_id,a.origin,a.severity,a.title,a.message,a.source,a.external_id,a.status,a.starts_at,a.expires_at,ST_AsGeoJSON(a.geometry)::jsonb AS geometry FROM alerts a JOIN organization_municipalities om ON om.organization_id=a.organization_id AND om.municipality_id=a.municipality_id WHERE a.organization_id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM memberships WHERE organization_id=$1 AND user_id=$3 AND (role IN ('admin','operator') OR a.status='published'))) AND (NOT $4::boolean OR (a.status='published' AND a.starts_at<=now() AND a.expires_at>now())) ORDER BY a.created_at DESC LIMIT 100`,[q.organizationId,req.actor.platformAdmin,req.actor.id,q.active==='true'])).rows;
 }
 @Post('subscriptions') async subscribe(@Req() req:AuthRequest,@Body() body:unknown){
  const v=parse(z.object({organizationId:uuid,municipalityId:uuid,coordinates:position.optional(),enabled:z.boolean().default(true)}).strict(),body);
  return this.svc.db.transaction(async c=>{
   await this.svc.access(c,req.actor,v.organizationId,v.municipalityId);
   if(v.coordinates&&!(await c.query('SELECT 1 FROM municipalities WHERE id=$1 AND ST_Covers(boundary,ST_SetSRID(ST_MakePoint($2,$3),4326))',[v.municipalityId,...v.coordinates])).rowCount)throw new BadRequestException('Ponto fora do território conhecido');
   const row=(await c.query(`INSERT INTO subscriptions(user_id,organization_id,municipality_id,location,enabled) VALUES($1,$2,$3,CASE WHEN $4::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($4,$5),4326) END,$6) ON CONFLICT(user_id,organization_id,municipality_id) DO UPDATE SET location=excluded.location,enabled=excluded.enabled RETURNING id,enabled`,[req.actor.id,v.organizationId,v.municipalityId,v.coordinates?.[0]??null,v.coordinates?.[1]??null,v.enabled])).rows[0]!;
   await audit(c,req.actor.id,'subscription.update',row.id,v.organizationId,{enabled:v.enabled});return row;
  });
 }
 @Get('subscriptions') async subscriptions(@Req() req:AuthRequest){return (await this.svc.db.query('SELECT id,organization_id,municipality_id,enabled,ST_AsGeoJSON(location)::jsonb AS location FROM subscriptions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[req.actor.id])).rows;}
 @Get('notifications') async notifications(@Req() req:AuthRequest){return (await this.svc.db.query(`SELECT n.id,n.created_at,n.read_at,e.event_type,a.id AS alert_id,a.title,a.severity,a.origin,a.status,a.expires_at FROM notifications n JOIN alert_events e ON e.id=n.alert_event_id JOIN alerts a ON a.id=e.alert_id JOIN memberships m ON m.organization_id=a.organization_id AND m.user_id=n.user_id JOIN organization_municipalities om ON om.organization_id=a.organization_id AND om.municipality_id=a.municipality_id WHERE n.user_id=$1 ORDER BY n.created_at DESC LIMIT 100`,[req.actor.id])).rows;}
 @Patch('notifications/:id/read') async read(@Req() req:AuthRequest,@Param('id') id:string){await this.svc.db.query('UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2',[parse(uuid,id),req.actor.id]);return {success:true};}
}
