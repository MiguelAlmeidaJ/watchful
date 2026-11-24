import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { Database } from '../../common/database';
import { verifyPassword } from '../../common/password';
import { audit } from '../../common/audit';
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
const dummy='0'.repeat(32)+':'+ '0'.repeat(128);
@Injectable()
export class AuthService {
 private readonly secret:Uint8Array;
 constructor(@Inject(Database) private readonly db:Database){
  const secret=process.env.JWT_SECRET;
  if(!secret||Buffer.byteLength(secret)<32) throw new Error('JWT_SECRET must be at least 32 bytes');
  this.secret=new TextEncoder().encode(secret);
 }
 private async issue(client:PoolClient,userId:string,familyId:string){
  const refreshToken=randomBytes(48).toString('base64url');
  await client.query("INSERT INTO refresh_sessions(user_id,family_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '7 days')",[userId,familyId,digest(refreshToken)]);
  const accessToken=await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setSubject(userId).setIssuer('watchful').setAudience('watchful-api').setIssuedAt().setExpirationTime('15m').sign(this.secret);
  return {accessToken,refreshToken,expiresIn:900,tokenType:'Bearer'};
 }
 async login(email:string,password:string){
  const user=(await this.db.query('SELECT id,password_hash,active FROM users WHERE email=$1',[email])).rows[0];
  const valid=await verifyPassword(password,user?.password_hash??dummy);
  if(!user||!valid||!user.active) throw new UnauthorizedException('Credenciais inválidas');
  return this.db.transaction(async c=>{
   const current=(await c.query('SELECT active,password_hash FROM users WHERE id=$1 FOR UPDATE',[user.id])).rows[0];
   if(!current?.active||current.password_hash!==user.password_hash) throw new UnauthorizedException();
   const tokens=await this.issue(c,user.id,randomUUID());
   await audit(c,user.id,'auth.login',user.id);
   return tokens;
  });
 }
 async refresh(token:string){
  const result=await this.db.transaction(async c=>{
   const initial=(await c.query('SELECT family_id FROM refresh_sessions WHERE token_hash=$1',[digest(token)])).rows[0];
   if(!initial) return null;
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[initial.family_id]);
   const session=(await c.query('SELECT s.*,u.active FROM refresh_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 FOR UPDATE OF s',[digest(token)])).rows[0];
   if(!session) return null;
   if(session.used_at||session.revoked_at){
    await c.query('UPDATE refresh_sessions SET revoked_at=now() WHERE family_id=$1 AND revoked_at IS NULL',[session.family_id]);
    await audit(c,session.user_id,'auth.refresh_reuse',session.family_id);
    return null;
   }
   if(!session.active||new Date(session.expires_at).getTime()<=Date.now()) return null;
   await c.query('UPDATE refresh_sessions SET used_at=now() WHERE id=$1',[session.id]);
   return this.issue(c,session.user_id,session.family_id);
  });
  if(!result) throw new UnauthorizedException('Sessão inválida');
  return result;
 }
 async logout(token:string){
  await this.db.transaction(async c=>{
   const s=(await c.query('SELECT family_id FROM refresh_sessions WHERE token_hash=$1',[digest(token)])).rows[0];
   if(s){await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[s.family_id]);await c.query('UPDATE refresh_sessions SET revoked_at=now() WHERE family_id=$1 AND revoked_at IS NULL',[s.family_id]);}
  });
  return {success:true};
 }
 async authenticate(token:string){
  let subject:string|undefined;
  try{ const result=await jwtVerify(token,this.secret,{algorithms:['HS256'],issuer:'watchful',audience:'watchful-api'}); subject=result.payload.sub; }catch{throw new UnauthorizedException();}
  if(!subject) throw new UnauthorizedException();
  const user=(await this.db.query('SELECT id,email,platform_admin FROM users WHERE id=$1 AND active',[subject])).rows[0];
  if(!user) throw new UnauthorizedException();
  return {id:user.id as string,email:user.email as string,platformAdmin:user.platform_admin as boolean};
 }
}
