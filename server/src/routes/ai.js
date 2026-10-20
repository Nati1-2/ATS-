import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Report } from '../models/index.js';
import { accessibleJobIds } from '../middleware/auth.js';
import { aiChatLimiter, aiReportLimiter } from '../middleware/rateLimits.js';
import { HttpError, validate, assertObjectId } from '../utils/http.js';
import { aiEnabled, AI_MODEL } from '../utils/ai.js';
import { hiringStats } from '../utils/insights.js';
import { chat, writeReport } from '../utils/assistant.js';

const router = Router();

router.get('/status', (_req, res) => res.json({ enabled: aiEnabled(), model: aiEnabled() ? AI_MODEL : null }));

// ---- Assistant ----
const chatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(40)
    .refine((m) => m[m.length - 1].role === 'user', 'The last message must be from the user'),
});

router.post('/chat', aiChatLimiter, async (req, res) => {
  if (!aiEnabled()) throw new HttpError(400, 'The AI assistant is not set up on this server (GEMINI_API_KEY is missing).');
  const { messages } = validate(chatSchema, req.body);
  const result = await chat(req.user, messages);
  if (result.error) throw new HttpError(result.rateLimited ? 429 : 502, result.error);
  res.json(result);
});

// ---- Reports ----
/** Reports this user may open: their own, plus (for admins/recruiters) everyone's; hiring managers only see job reports for their jobs. */
async function reportFilter(user) {
  const ids = await accessibleJobIds(user);
  if (!ids) return {};
  return { $or: [{ createdBy: user._id }, { job: { $in: ids } }] };
}

router.get('/reports', async (req, res) => {
  const reports = await Report.find(await reportFilter(req.user))
    .select('title job aiStatus createdBy createdAt stats.totals')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();
  res.json({ reports });
});

router.get('/reports/:id', async (req, res) => {
  assertObjectId(req.params.id, 'Report');
  const report = await Report.findOne({ _id: req.params.id, ...(await reportFilter(req.user)) }).populate('createdBy', 'name').lean();
  if (!report) throw new HttpError(404, 'Report not found');
  res.json({ report });
});

router.post('/reports', aiReportLimiter, async (req, res) => {
  const { jobId } = validate(z.object({ jobId: z.string().optional() }), req.body ?? {});
  const stats = await hiringStats(req.user, { jobId: jobId || undefined }); // permission-checked
  // The numbers are always saved; the AI text is added when AI is available
  const ai = aiEnabled() ? await writeReport(stats) : { status: 'disabled' };
  const report = await Report.create({
    job: jobId ? new mongoose.Types.ObjectId(jobId) : undefined,
    title: jobId ? `${stats.scope.title} — hiring report` : 'All jobs — hiring report',
    stats,
    narrative: ai.narrative,
    aiStatus: ai.status,
    aiError: ai.error,
    model: ai.model,
    createdBy: req.user._id,
  });
  res.status(201).json({ report: await report.populate('createdBy', 'name') });
});

export default router;
