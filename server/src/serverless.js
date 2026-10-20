/**
 * Serverless request handler for Vercel. Used by the Next.js app (client/src/pages/api)
 * so one deployment serves both the web app and the API.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { waitUntil } from '@vercel/functions';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { resumePendingAi, setBackgroundHook } from './utils/aiQueue.js';

// The web app is served from the same deployment, so its URL is a safe default for invite/reset links
if (!process.env.CLIENT_URL && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
  process.env.CLIENT_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
}
const config = loadConfig();
const app = createApp();
setBackgroundHook(waitUntil);

// Reuse one connection across invocations of a warm instance
let connecting = null;
function connect() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  connecting ??= mongoose
    .connect(config.mongoUri, { serverSelectionTimeoutMS: 10_000 })
    .then(() => {
      resumePendingAi().catch((err) => console.error('[ai] resume failed:', err.message));
    })
    .catch((err) => {
      connecting = null; // retry on the next request
      throw err;
    });
  return connecting;
}

export default async function handler(req, res) {
  try {
    await connect();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Database unavailable' }));
  }
  return app(req, res);
}
