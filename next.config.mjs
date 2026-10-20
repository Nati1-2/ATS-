import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
// On Vercel the Express API runs inside this app (src/pages/api/[...path].mjs), so one deployment
// serves both. Elsewhere it is a separate server, read at build time (rewrites are compiled into
// the build), so Docker passes it as a build argument.
const ON_VERCEL = Boolean(process.env.VERCEL);
const API_URL = process.env.API_URL || 'http://localhost:5000';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' }, // résumé PDF preview is a same-origin iframe
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
  output: ON_VERCEL ? undefined : 'standalone', // self-contained server for the Docker image; Vercel builds its own
  // The .mjs API bridge imports ../server, which only exists in the Vercel build
  pageExtensions: ON_VERCEL ? ['js', 'jsx', 'mjs'] : ['js', 'jsx'],
  // Include server/ in the Vercel build output so the API bridge can import it.
  // Since next.config.mjs is now at the project root, the root dir is just __dirname.
  outputFileTracingRoot: ON_VERCEL ? path.dirname(fileURLToPath(import.meta.url)) : undefined,
  poweredByHeader: false,
  devIndicators: false, // keep the dev build looking like production
  // Proxy API calls to the Express server so auth cookies stay same-origin.
  async rewrites() {
    if (ON_VERCEL) return [];
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
