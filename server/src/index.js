import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../../.env') });
import mongoose from 'mongoose';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { resumePendingAi } from './utils/aiQueue.js';
import { aiEnabled, AI_MODEL } from './utils/ai.js';
import { ensureEnvAdmin } from './utils/envAdmin.js';

const config = loadConfig();
const app = createApp();

async function start() {
  await mongoose.connect(config.mongoUri);
  await ensureEnvAdmin();
  const server = app.listen(config.port, () => console.log(`ATS API listening on http://localhost:${config.port} (${config.env})`));
  console.log(aiEnabled() ? `AI analysis enabled (${AI_MODEL})` : 'AI analysis disabled (set GEMINI_API_KEY to enable)');
  resumePendingAi().catch((err) => console.error('[ai] resume failed:', err.message));

  // Graceful shutdown: stop accepting requests, finish in-flight ones, then close the database
  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    console.log(`${signal} received, shutting down…`);
    server.close(async () => {
      await mongoose.disconnect().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
