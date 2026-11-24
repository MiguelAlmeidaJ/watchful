import { Body, Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { AuthGuard, type AuthRequest } from './auth.guard';
import { Database } from '../../common/database';
import { email, parse } from '../../common/validation';
const refreshSchema=z.object({refreshToken:z.string().min(64).max(128)}).strict();
@Controller('auth')
export class AuthController {
 constructor(@Inject(AuthService) private readonly auth:AuthService,@Inject(Database) private readonly db:Database){}
 @Post('login') @HttpCode(200) login(@Body() body:unknown){const input=parse(z.object({email,password:z.string().min(1).max(128)}).strict(),body);return this.auth.login(input.email,input.password);}
 @Post('refresh') @HttpCode(200) refresh(@Body() body:unknown){return this.auth.refresh(parse(refreshSchema,body).refreshToken);}
 @Post('logout') @HttpCode(200) logout(@Body() body:unknown){return this.auth.logout(parse(refreshSchema,body).refreshToken);}
 @Get('me') @UseGuards(AuthGuard) async me(@Req() req:AuthRequest){return {...req.actor,memberships:(await this.db.query('SELECT organization_id,role FROM memberships WHERE user_id=$1',[req.actor.id])).rows};}
}
