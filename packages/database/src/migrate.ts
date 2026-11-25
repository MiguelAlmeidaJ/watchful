import { config } from 'dotenv';
import { resolve } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { Client } from 'pg';
config({path:resolve(__dirname,'../../../.env')});
async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const db = new Client({connectionString:process.env.DATABASE_URL});
  await db.connect();
  try {
    await db.query('SELECT pg_advisory_lock(728123)');
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const dir=resolve(__dirname,'../migrations');
    for (const name of readdirSync(dir).filter(x=>x.endsWith('.sql')).sort()) {
      if ((await db.query('SELECT 1 FROM schema_migrations WHERE name=$1',[name])).rowCount) continue;
      await db.query('BEGIN');
      try { await db.query(readFileSync(resolve(dir,name),'utf8')); await db.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]); await db.query('COMMIT'); }
      catch(error) { await db.query('ROLLBACK'); throw error; }
    }
  } finally { await db.end(); }
}
migrate().catch(error=>{console.error(error);process.exit(1)});
