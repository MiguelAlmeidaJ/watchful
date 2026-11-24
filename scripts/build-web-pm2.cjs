const path = require('node:path');
const { spawnSync } = require('node:child_process');
const web = path.resolve(__dirname, '../apps/web');
const cli = require.resolve('next/dist/bin/next', { paths: [web] });
// Public variables are embedded by Next.js at build time.
const result = spawnSync(process.execPath, [cli, 'build'], {
  cwd: web,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_PUBLIC_API_URL: 'http://localhost:4005/api/v1'
  }
});
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
