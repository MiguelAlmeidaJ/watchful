import { CanActivate, ExecutionContext, Injectable, Inject, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { Request } from 'express';
export type Actor={id:string;email:string;platformAdmin:boolean};
export type AuthRequest=Request & {actor:Actor};
@Injectable()
export class AuthGuard implements CanActivate {
 constructor(@Inject(AuthService) private readonly auth:AuthService){}
 async canActivate(context:ExecutionContext){
  const request=context.switchToHttp().getRequest<AuthRequest>();
  const token=request.headers.authorization;
  if(!token?.startsWith('Bearer ')) throw new UnauthorizedException();
  request.actor=await this.auth.authenticate(token.slice(7));return true;
 }
}
export function requirePlatform(actor:Actor){if(!actor.platformAdmin) throw new ForbiddenException();}
