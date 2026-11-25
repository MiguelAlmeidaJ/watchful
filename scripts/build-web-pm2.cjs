const path = require('node:path');
const { spawnSync } = require('node:child_process');
const web = path.resolve(__dirname, '../apps/web');
const cli = require.resolve('next/dist/bin/next', { paths: [web] });
const production = process.argv.includes('--production');
// Public variables are embedded by Next.js at build time.
const result = spawnSync(process.execPath, [cli, 'build'], {
  cwd: web,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || (production ? '/api/v1' : 'http://localhost:4005/api/v1'),
    WATCHFUL_API_UPSTREAM: production ? 'http://127.0.0.1:4005' : ''
  }
});
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
