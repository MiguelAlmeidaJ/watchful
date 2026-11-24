import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
config({ path: resolve(__dirname, '../../../.env') });
async function bootstrap() {
  const connection = new Redis(process.env.REDIS_QUEUE_URL ?? 'redis://localhost:6380', { maxRetriesPerRequest: null });
  const queue = new Queue('weather.ingestion', { connection });
  await queue.waitUntilReady();
  console.log('Watchful worker foundation connected; ingestion processors not enabled.');
  let closing = false;
  const shutdown = async () => { if (closing) return; closing = true; await queue.close(); await connection.quit(); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
bootstrap().catch(error => { console.error(error); process.exit(1); });
