/**
 * Runs AI analysis in the background so applicants never wait for it.
 * Small in-process queue (2 at a time); unfinished work is picked up again on restart.
 */
import { Application, Job } from '../models/index.js';
import { aiEnabled, analyzeApplication, resumeFilePath } from './ai.js';
import { UPLOAD_DIR } from './uploads.js';
import { scoreApplication } from './scoring.js';
import { decideApplication, applyDecision } from './screening.js';
import { logActivity } from './activity.js';
import { screenWithAi } from './aiScreening.js';

const CONCURRENCY = 2;
const MAX_RATE_LIMIT_RETRIES = 5;
const queue = [];
const queued = new Set();
let running = 0;
// Serverless hosts (Vercel) may freeze the process once a response is sent; they pass waitUntil here.
let keepAlive = () => {};

export function setBackgroundHook(fn) {
  keepAlive = fn;
}

export function enqueueAi(applicationId) {
  if (!aiEnabled()) return;
  const id = String(applicationId);
  if (queued.has(id)) return;
  queued.add(id);
  queue.push(id);
  pump();
}

function pump() {
  while (running < CONCURRENCY && queue.length) {
    const id = queue.shift();
    running += 1;
    const work = processApplication(id)
      .catch((err) => console.error(`[ai] ${id}: ${err.message}`))
      .finally(() => {
        running -= 1;
        queued.delete(id);
        pump();
      });
    keepAlive(work);
  }
}

const FIT_LABEL = { strong: 'strong fit', good: 'good fit', partial: 'partial fit', weak: 'weak fit' };

export async function processApplication(id, deps = {}) {
  const app = await Application.findById(id).select('+resumeText');
  if (!app) return null;
  const job = await Job.findById(app.job);
  if (!job) return null;
  app.ai = { ...(app.ai || {}), status: 'processing' };
  await app.save();

  const result = await analyzeApplication(
    {
      job,
      resumePath: app.resume?.filename ? resumeFilePath(UPLOAD_DIR, app.resume.filename) : null,
      resumeMime: app.resume?.mimetype,
      resumeText: app.resumeText,
      coverLetter: app.coverLetter,
    },
    deps
  );

  const { cvText, rateLimited, retryAfterMs, ...stored } = result;

  // Rate limited (common on free API tiers during bursts): keep it queued and retry later on its own
  const retries = app.ai?.rateLimitRetries ?? 0;
  if (rateLimited && retries < MAX_RATE_LIMIT_RETRIES) {
    // Google says how long to wait (e.g. until the daily quota resets); otherwise back off 1, 2, 3… minutes
    const delay = deps.retryDelayMs ?? result.retryAfterMs ?? 60_000 * (retries + 1);
    app.ai = { status: 'pending', waitingForRateLimit: true, rateLimitRetries: retries + 1, retryAt: new Date(Date.now() + delay) };
    await app.save();
    setTimeout(() => enqueueAi(app._id), delay).unref();
    return app;
  }
  app.ai = stored;

  // Scanned CV: the AI's transcription makes the normal rule-based scoring possible
  if (result.status === 'done' && result.transcribed && cvText) {
    app.resumeText = cvText;
    app.resumeTextExtracted = true;
    app.resumeTextSource = 'ai';
    app.match = scoreApplication(job, { resumeText: cvText, coverLetter: app.coverLetter }) ?? undefined;
    let note = `Scanned CV read by AI${app.match ? `; CV match re-scored to ${app.match.score}%` : ''}`;
    // Re-run the automatic rules only for people still waiting in Applied for a human review
    if (app.stage === 'applied' && app.autoDecision === 'review') {
      const decision = decideApplication(job, { match: app.match, screeningPassed: app.screeningPassed, resumeReadable: true });
      if (decision.decision === 'rejected') {
        // Text read by AI from an image may contain mistakes — never auto-reject on it
        decision.decision = null;
        decision.stage = 'applied';
        decision.reasons = [`Would be rejected (${decision.reasons.join('; ')}), but the CV was read by AI from a scanned file — check before rejecting`];
      }
      const activity = applyDecision(app, decision);
      if (activity) note += `. ${activity.message}`;
      else if (decision.reasons.length) note += `. ${decision.reasons[0]}`;
    }
    await app.save();
    await logActivity({ application: app, type: 'ai_analyzed', message: note });
  } else {
    await app.save();
  }

  if (result.status === 'done') {
    await logActivity({ application: app, type: 'ai_analyzed', message: `AI summary ready (${FIT_LABEL[result.fitLevel]}, ${result.fitScore}%)` });
    // The job's AI screening rules (if any) act on the finished analysis
    await screenWithAi(job, app);
  }
  return app;
}

/** On startup, finish anything that was pending when the server stopped. */
export async function resumePendingAi() {
  if (!aiEnabled()) return;
  const pending = await Application.find({ 'ai.status': { $in: ['pending', 'processing'] } }).select('_id ai');
  for (const a of pending) {
    const wait = a.ai?.retryAt ? new Date(a.ai.retryAt).getTime() - Date.now() : 0;
    if (wait > 0) setTimeout(() => enqueueAi(a._id), wait).unref();
    else enqueueAi(a._id);
  }
  if (pending.length) console.log(`[ai] resuming ${pending.length} pending analyses`);
}
