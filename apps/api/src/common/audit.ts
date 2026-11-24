import type { PoolClient } from 'pg';
export async function audit(db:PoolClient,actor:string|null,action:string,target:string,org:string|null=null,details:Record<string,unknown>={}){
 await db.query('INSERT INTO audit_logs(actor_id,organization_id,action,target,details) VALUES($1,$2,$3,$4,$5)',[actor,org,action,target,JSON.stringify(details)]);
}
