import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

export default function config(phase: string): NextConfig {
 const previaLocal = phase === PHASE_DEVELOPMENT_SERVER && process.env.WATCHFUL_RIO_PREVIEW === '1';
 const apiUpstream = process.env.WATCHFUL_API_UPSTREAM;
 return {
  transpilePackages: ['@watchful/api-client', '@watchful/design-tokens'],
  ...(apiUpstream && {
   async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiUpstream}/api/v1/:path*` }];
   },
  }),
  ...(previaLocal && {
   distDir: '.turbo/rio-dev',
   typescript: { tsconfigPath: '.turbo/rio-preview-tsconfig.json' },
   devIndicators: false,
  }),
 };
}
