const path = require('node:path');
const root = __dirname;
const api = path.join(root, 'apps', 'api');
const worker = path.join(root, 'apps', 'worker');
const web = path.join(root, 'apps', 'web');

module.exports = {
  apps: [
    {
      name: 'watchful-worker', cwd: worker, script: path.join(worker, 'dist', 'main.js'),
      interpreter: process.execPath, instances: 1, exec_mode: 'fork', autorestart: true, watch: false,
      restart_delay: 2000, max_restarts: 10, min_uptime: 10000, kill_timeout: 30000, time: true,
      env: { NODE_ENV: 'production', WEATHER_INGESTION_ENABLED: 'true', RISK_EVALUATION_ENABLED: 'false', ALERT_INTERNAL_PUBLICATION_ENABLED: 'false', OPEN_METEO_BASE_URL: 'https://api.open-meteo.com/v1/forecast', OPEN_METEO_API_KEY: '' }
    },
    {
      name: 'watchful-api',
      cwd: api,
      script: path.join(api, 'dist', 'main.js'),
      interpreter: process.execPath,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      restart_delay: 2000,
      max_restarts: 10,
      min_uptime: 10000,
      kill_timeout: 10000,
      time: true,
      env: {
        NODE_ENV: 'production',
        API_HOST: '127.0.0.1',
        API_PORT: '4005',
        WEB_ORIGIN: 'http://localhost:3005',
        WEATHER_INGESTION_ENABLED: 'false',
        RISK_EVALUATION_ENABLED: 'false',
        ALERT_INTERNAL_PUBLICATION_ENABLED: 'false'
      }
    },
    {
      name: 'watchful-web',
      cwd: web,
      script: require.resolve('next/dist/bin/next', { paths: [web] }),
      args: ['start', '--port', '3005', '--hostname', '127.0.0.1'],
      interpreter: process.execPath,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      restart_delay: 2000,
      max_restarts: 10,
      min_uptime: 10000,
      kill_timeout: 10000,
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: '3005',
        NEXT_PUBLIC_API_URL: 'http://localhost:4005/api/v1'
      }
    }
  ]
};
