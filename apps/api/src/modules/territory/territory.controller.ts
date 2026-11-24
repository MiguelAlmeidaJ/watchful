import { Body, Controller, Get, Post, Query, Req, UseGuards, Inject, BadGatewayException, NotFoundException, ConflictException } from '@nestjs/common';
import { z } from 'zod';
import { Database } from '../../common/database';
import { parse, uuid } from '../../common/validation';
import { audit } from '../../common/audit';
import { AuthGuard, requirePlatform, type AuthRequest } from '../auth/auth.guard';
const state=z.enum(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']);
const municipality=z.object({ibgeCode:z.string().regex(/^\d{7}$/),name:z.string().trim().min(1).max(150),state}).strict();
const pagination=z.object({limit:z.coerce.number().int().min(1).max(100).default(50),offset:z.coerce.number().int().min(0).max(100000).default(0)});
@Controller()
@UseGuards(AuthGuard)
export class TerritoryController {
 constructor(@Inject(Database) private readonly db:Database){}
 @Get('municipalities') async list(@Req() req:AuthRequest,@Query() query:unknown){
  const q=parse(pagination.extend({state:state.optional()}),query);
  return (await this.db.query('SELECT id,ibge_code,name,state FROM municipalities m WHERE ($1::text IS NULL OR m.state=$1) AND ($2::boolean OR EXISTS (SELECT 1 FROM organization_municipalities om JOIN memberships ms ON ms.organization_id=om.organization_id WHERE om.municipality_id=m.id AND ms.user_id=$3)) ORDER BY name,id LIMIT $4 OFFSET $5',[q.state??null,req.actor.platformAdmin,req.actor.id,q.limit,q.offset])).rows;
 }
 @Post('municipalities') async create(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const input=parse(municipality,body);
  return this.db.transaction(async c=>{const row=(await c.query('INSERT INTO municipalities(ibge_code,name,state) VALUES($1,$2,$3) ON CONFLICT(ibge_code) DO NOTHING RETURNING id,ibge_code,name,state',[input.ibgeCode,input.name,input.state])).rows[0];if(!row)throw new ConflictException('Município já cadastrado');await audit(c,req.actor.id,'municipality.create',row.id);return row;});
 }
 @Post('municipalities/import') async importIbge(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const input=parse(z.object({state}).strict(),body);
  const url='https://servicodados.ibge.gov.br/api/v1/localidades/estados/'+input.state+'/municipios';
  let raw:unknown;
  try{const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error();raw=await response.json();}catch{throw new BadGatewayException('Fonte IBGE indisponível');}
  const result=z.array(z.object({id:z.number().int(),nome:z.string().min(1).max(150)})).min(1).max(1000).safeParse(raw);
  if(!result.success||result.data.some(x=>!/^\d{7}$/.test(String(x.id))))throw new BadGatewayException('Resposta IBGE inválida');
  return this.db.transaction(async c=>{for(const m of result.data)await c.query('INSERT INTO municipalities(ibge_code,name,state) VALUES($1,$2,$3) ON CONFLICT(ibge_code) DO UPDATE SET name=excluded.name,state=excluded.state',[String(m.id),m.nome,input.state]);await audit(c,req.actor.id,'municipality.import',input.state,null,{count:result.data.length});return {count:result.data.length};});
 }
 @Get('stations') async stations(@Req() req:AuthRequest,@Query() query:unknown){
  const q=parse(pagination.extend({municipalityId:uuid.optional()}),query);
  return (await this.db.query('SELECT s.id,s.municipality_id,s.provider,s.external_id,s.name,ST_Y(s.location) AS latitude,ST_X(s.location) AS longitude FROM stations s WHERE ($1::uuid IS NULL OR s.municipality_id=$1) AND ($2::boolean OR EXISTS (SELECT 1 FROM organization_municipalities om JOIN memberships ms ON ms.organization_id=om.organization_id WHERE om.municipality_id=s.municipality_id AND ms.user_id=$3)) ORDER BY s.name,s.id LIMIT $4 OFFSET $5',[q.municipalityId??null,req.actor.platformAdmin,req.actor.id,q.limit,q.offset])).rows;
 }
 @Post('stations') async createStation(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const v=parse(z.object({municipalityId:uuid,provider:z.string().trim().min(1).max(50),externalId:z.string().trim().min(1).max(100),name:z.string().trim().min(1).max(150),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).strict(),body);
  return this.db.transaction(async c=>{if(!(await c.query('SELECT 1 FROM municipalities WHERE id=$1',[v.municipalityId])).rowCount)throw new NotFoundException();
   const row=(await c.query('INSERT INTO stations(municipality_id,provider,external_id,name,location) VALUES($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326)) ON CONFLICT(provider,external_id) DO NOTHING RETURNING id,name',[v.municipalityId,v.provider,v.externalId,v.name,v.longitude,v.latitude])).rows[0];
   if(!row)throw new ConflictException('Estação já cadastrada');await audit(c,req.actor.id,'station.create',row.id);return row;});
 }
}
