/**
 * Vercel serverless entry point. Every request is rewritten here (see vercel.json);
 * the Express app keeps its own /api/... routing.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { waitUntil } from '@vercel/functions';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { resumePendingAi, setBackgroundHook } from '../src/utils/aiQueue.js';

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
