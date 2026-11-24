import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { hashPassword } from '../common/password';
import { email,password,parse } from '../common/validation';
config({path:resolve(__dirname,'../../../../.env')});
async function main(){
 const address=parse(email,process.env.BOOTSTRAP_ADMIN_EMAIL);
 const secret=parse(password,process.env.BOOTSTRAP_ADMIN_PASSWORD);
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
 const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();
 try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(728124)');
 if((await c.query('SELECT 1 FROM users WHERE platform_admin')).rowCount)throw new Error('Platform administrator already exists');
 const result=await c.query('INSERT INTO users(email,password_hash,platform_admin) VALUES($1,$2,true) RETURNING id',[address,await hashPassword(secret)]);
 await c.query("INSERT INTO audit_logs(actor_id,action,target) VALUES($1,'admin.bootstrap',$1::text)",[result.rows[0]!.id]);
 await c.query('COMMIT');console.log('Platform administrator created');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Bootstrap failed');process.exit(1);});
