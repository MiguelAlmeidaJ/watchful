import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Database } from '../../common/database';
@Controller('health')
export class HealthController {
 constructor(@Inject(Database) private readonly db:Database){}
 @Get('live') live(){return {status:'ok',service:'watchful-api',timestamp:new Date().toISOString()};}
 @Get('ready') async ready(){try{await this.db.query("SELECT 1 FROM schema_migrations WHERE name='013_flow_compositions.sql'").then(r=>{if(!r.rowCount)throw new Error();});return {status:'ok',database:'ready'};}catch{throw new ServiceUnavailableException('Banco indisponível ou migração pendente');}}
}
