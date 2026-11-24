import { Body, Controller, Get, Post, Param, Req, UseGuards, Inject, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { z } from 'zod';
import { Database } from '../../common/database';
import { audit } from '../../common/audit';
import { parse, uuid, email, password } from '../../common/validation';
import { hashPassword } from '../../common/password';
import { AuthGuard, requirePlatform, type AuthRequest } from '../auth/auth.guard';
@Controller('organizations')
@UseGuards(AuthGuard)
export class OrganizationsController {
 constructor(@Inject(Database) private readonly db:Database){}
 @Get() async list(@Req() req:AuthRequest){
  return (await this.db.query('SELECT o.id,o.name,m.role FROM organizations o LEFT JOIN memberships m ON m.organization_id=o.id AND m.user_id=$1 WHERE $2::boolean OR m.user_id IS NOT NULL ORDER BY o.name',[req.actor.id,req.actor.platformAdmin])).rows;
 }
 @Post() async create(@Req() req:AuthRequest,@Body() body:unknown){
  requirePlatform(req.actor);const input=parse(z.object({name:z.string().trim().min(2).max(150)}).strict(),body);
  return this.db.transaction(async c=>{const org=(await c.query('INSERT INTO organizations(name) VALUES($1) RETURNING id,name',[input.name])).rows[0]!;await audit(c,req.actor.id,'organization.create',org.id,org.id);return org;});
 }
 @Get(':id/users') async users(@Req() req:AuthRequest,@Param('id') id:string){
  const org=parse(uuid,id);
  if(!req.actor.platformAdmin && !(await this.db.query("SELECT 1 FROM memberships WHERE organization_id=$1 AND user_id=$2 AND role='admin'",[org,req.actor.id])).rowCount) throw new ForbiddenException();
  return (await this.db.query('SELECT u.id,u.email,u.active,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY u.email',[org])).rows;
 }
 @Post(':id/users') async createUser(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:unknown){
  const org=parse(uuid,id); const input=parse(z.object({email,password,role:z.enum(['admin','operator','viewer'])}).strict(),body);
  // Only platform admins provision accounts; avoids cross-tenant account takeover.
  requirePlatform(req.actor);
  const hash=await hashPassword(input.password);
  return this.db.transaction(async c=>{
   if(!(await c.query('SELECT 1 FROM organizations WHERE id=$1',[org])).rowCount) throw new NotFoundException();
   const user=(await c.query('INSERT INTO users(email,password_hash) VALUES($1,$2) ON CONFLICT(email) DO NOTHING RETURNING id,email',[input.email,hash])).rows[0];
   if(!user) throw new ConflictException('Conta já cadastrada');
   await c.query('INSERT INTO memberships(user_id,organization_id,role) VALUES($1,$2,$3)',[user.id,org,input.role]);
   await audit(c,req.actor.id,'user.create',user.id,org,{role:input.role});return {...user,role:input.role};
  });
 }
 @Post(':id/memberships') async addMember(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:unknown){
  requirePlatform(req.actor);const org=parse(uuid,id);const input=parse(z.object({userId:uuid,role:z.enum(['admin','operator','viewer'])}).strict(),body);
  return this.db.transaction(async c=>{
   if(!(await c.query('SELECT 1 FROM organizations WHERE id=$1',[org])).rowCount||!(await c.query('SELECT 1 FROM users WHERE id=$1 AND active',[input.userId])).rowCount)throw new NotFoundException();
   await c.query('INSERT INTO memberships(user_id,organization_id,role) VALUES($1,$2,$3) ON CONFLICT(user_id,organization_id) DO UPDATE SET role=excluded.role',[input.userId,org,input.role]);
   await audit(c,req.actor.id,'membership.upsert',input.userId,org,{role:input.role});return {success:true};
  });
 }
 @Post(':id/municipalities') async assign(@Req() req:AuthRequest,@Param('id') id:string,@Body() body:unknown){
  requirePlatform(req.actor);const org=parse(uuid,id);const {municipalityId}=parse(z.object({municipalityId:uuid}).strict(),body);
  return this.db.transaction(async c=>{
   if(!(await c.query('SELECT 1 FROM organizations WHERE id=$1',[org])).rowCount||!(await c.query('SELECT 1 FROM municipalities WHERE id=$1',[municipalityId])).rowCount)throw new NotFoundException();
   await c.query('INSERT INTO organization_municipalities VALUES($1,$2) ON CONFLICT DO NOTHING',[org,municipalityId]);await audit(c,req.actor.id,'municipality.assign',municipalityId,org);return {success:true};
  });
 }
 @Get(':id/audit') async logs(@Req() req:AuthRequest,@Param('id') id:string){
  const org=parse(uuid,id);if(!req.actor.platformAdmin&&!(await this.db.query("SELECT 1 FROM memberships WHERE organization_id=$1 AND user_id=$2 AND role='admin'",[org,req.actor.id])).rowCount)throw new ForbiddenException();
  return (await this.db.query('SELECT id,actor_id,action,target,details,created_at FROM audit_logs WHERE organization_id=$1 ORDER BY id DESC LIMIT 100',[org])).rows;
 }
}
