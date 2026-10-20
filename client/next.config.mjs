/** @type {import('next').NextConfig} */
// Where the Express API lives. Read at build time (rewrites are compiled into the build),
// so Docker passes it as a build argument.
const API_URL = process.env.API_URL || 'http://localhost:5000';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' }, // résumé PDF preview is a same-origin iframe
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone', // self-contained server for the Docker image; Vercel builds its own
  poweredByHeader: false,
  devIndicators: false, // keep the dev build looking like production
  // Proxy API calls to the Express server so auth cookies stay same-origin.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
