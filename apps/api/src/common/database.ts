import { Global, Module, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
@Injectable()
export class Database implements OnModuleDestroy {
 private readonly pool: Pool;
 constructor() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  this.pool = new Pool({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:5000});
 }
 query<T extends QueryResultRow = QueryResultRow>(sql:string, values:unknown[] = []) { return this.pool.query<T>(sql,values); }
 async transaction<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T> {
  const client=await this.pool.connect();
  try { await client.query('BEGIN'); const result=await fn(client); await client.query('COMMIT'); return result; }
  catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
 }
 async onModuleDestroy(){ await this.pool.end(); }
}
@Global()
@Module({providers:[Database],exports:[Database]})
export class DatabaseModule {}
