// Vercel only (see pageExtensions in next.config.mjs): serves the Express API from this same
// deployment. Locally and in Docker, /api/* is proxied to the separate API server instead.
import handler from '../../../server/src/serverless.js';

export const config = {
  api: { bodyParser: false, externalResolver: true, responseLimit: false },
  maxDuration: 60,
};

export default handler;
