import { Router } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import { Application, Note, Interview, User, STAGES } from '../models/index.js';
import { assertJobAccess, accessibleJobIds, canManageHiring, requireRole } from '../middleware/auth.js';
import { HttpError, validate, assertObjectId } from '../utils/http.js';
import { fetchFile } from '../utils/uploads.js';
import { logActivity, STAGE_LABELS } from '../utils/activity.js';
import { aiEnabled } from '../utils/ai.js';
import { enqueueAi } from '../utils/aiQueue.js';
import { noteManualStageChange } from '../utils/aiScreening.js';

const router = Router();
const manage = requireRole('admin', 'recruiter');

async function loadApplication(req) {
  assertObjectId(req.params.id, 'Application');
  const app = await Application.findById(req.params.id).populate('job', 'title status').populate('candidate', 'fullName email');
  if (!app) throw new HttpError(404, 'Application not found');
  await assertJobAccess(req.user, app.job._id);
  return app;
}

// Latest CV results for the notification bell (scoped to jobs the user can see)
router.get('/feed', async (req, res) => {
  const ids = await accessibleJobIds(req.user);
  const filter = ids ? { job: { $in: ids } } : {};
  const since = req.query.since ? new Date(String(req.query.since)) : null;
  if (since && !Number.isNaN(since.getTime())) filter.createdAt = { $gt: since };
  const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 15));
  const items = await Application.find(filter)
    .populate('candidate', 'fullName')
    .populate('job', 'title')
    .select('candidate job stage match.score autoDecision autoDecisionReasons screeningPassed resumeTextExtracted aiScreen.action ai.fitScore createdAt')
    .sort({ createdAt: -1 })
    .limit(limit);
  res.json({ items, serverTime: new Date().toISOString() });
});

// Pipeline board data for one job
router.get('/', async (req, res) => {
  const { job } = req.query;
  if (typeof job !== 'string') throw new HttpError(400, 'A job is required');
  assertObjectId(job, 'Job');
  await assertJobAccess(req.user, job);
  const applications = await Application.find({ job })
    .populate('candidate', 'fullName email')
    .select('-coverLetter')
    .sort({ stageChangedAt: -1 });
  res.json({ applications });
});

router.patch('/:id/stage', manage, async (req, res) => {
  const { stage } = validate(z.object({ stage: z.enum(STAGES, { errorMap: () => ({ message: 'Invalid stage' }) }) }), req.body);
  const app = await loadApplication(req);
  const from = app.stage;
  if (from !== stage) {
    noteManualStageChange(app, stage, req.user);
    app.stage = stage;
    app.stageChangedAt = new Date();
    await app.save();
    await logActivity({
      application: app,
      actor: req.user,
      type: 'stage_changed',
      message: `Moved from ${STAGE_LABELS[from]} to ${STAGE_LABELS[stage]}`,
      meta: { from, to: stage },
    });
  }
  res.json({ application: app });
});

// Run (or re-run) the AI analysis for one application
router.post('/:id/ai', manage, async (req, res) => {
  if (!aiEnabled()) throw new HttpError(400, 'AI is not configured on this server (GEMINI_API_KEY is missing)');
  const app = await loadApplication(req);
  if (['pending', 'processing'].includes(app.ai?.status)) return res.json({ ai: app.ai });
  app.ai = { status: 'pending' };
  await app.save();
  enqueueAi(app._id);
  res.status(202).json({ ai: app.ai });
});

// Lightweight status check used by the profile while an analysis is running
router.get('/:id/ai', async (req, res) => {
  const app = await loadApplication(req);
  res.json({ ai: app.ai ?? null });
});

router.get('/:id/resume', async (req, res) => {
  const app = await loadApplication(req);
  if (!app.resume?.filename) throw new HttpError(404, 'No résumé on file');
  const filePath = await fetchFile('resumes', app.resume.filename);
  if (!filePath) throw new HttpError(404, 'Résumé file is missing');
  const inline = req.query.inline === '1' && app.resume.mimetype === 'application/pdf';
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(app.resume.mimetype);
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(app.resume.originalName)}`
  );
  fs.createReadStream(filePath).pipe(res);
});

const noteSchema = z
  .object({
    kind: z.enum(['note', 'feedback']),
    body: z.string().trim().min(1, 'Write something first').max(5000),
    rating: z.coerce.number().int().min(1).max(5).optional(),
    recommendation: z.enum(['strong_yes', 'yes', 'no', 'strong_no']).optional(),
  })
  .refine((d) => d.kind !== 'feedback' || d.rating, { message: 'Select a rating', path: ['rating'] });

router.post('/:id/notes', async (req, res) => {
  const data = validate(noteSchema, req.body);
  // Hiring managers may add feedback, but internal recruiter notes are for admins/recruiters.
  if (data.kind === 'note' && !canManageHiring(req.user)) throw new HttpError(403, 'Only recruiters can add internal notes');
  const app = await loadApplication(req);
  const note = await Note.create({
    application: app._id,
    candidate: app.candidate._id,
    author: req.user._id,
    kind: data.kind,
    body: data.body,
    ...(data.kind === 'feedback' ? { rating: data.rating, recommendation: data.recommendation } : {}),
  });
  await logActivity({
    application: app,
    actor: req.user,
    type: data.kind === 'feedback' ? 'feedback_added' : 'note_added',
    message: data.kind === 'feedback' ? `Left feedback (${data.rating}/5)` : 'Added an internal note',
  });
  res.status(201).json({ note: await note.populate('author', 'name role') });
});

const interviewSchema = z.object({
  scheduledAt: z.coerce.date({ errorMap: () => ({ message: 'Enter a valid date and time' }) }),
  durationMinutes: z.coerce.number().int().min(15, 'At least 15 minutes').max(480).default(60),
  interviewer: z.string().regex(/^[a-f\d]{24}$/i, 'Select an interviewer'),
  location: z.string().trim().max(300).optional().default(''),
});

router.post('/:id/interviews', manage, async (req, res) => {
  const data = validate(interviewSchema, req.body);
  const app = await loadApplication(req);
  const interviewer = await User.findOne({ _id: data.interviewer, active: true });
  if (!interviewer) throw new HttpError(400, 'Please correct the highlighted fields', { interviewer: 'Interviewer not found' });
  const interview = await Interview.create({
    ...data,
    application: app._id,
    candidate: app.candidate._id,
    job: app.job._id,
    createdBy: req.user._id,
  });
  await logActivity({
    application: app,
    actor: req.user,
    type: 'interview_scheduled',
    message: `Scheduled an interview with ${interviewer.name}`,
    meta: { scheduledAt: data.scheduledAt },
  });
  res.status(201).json({ interview: await interview.populate('interviewer', 'name email') });
});

export const interviewsRouter = Router();

interviewsRouter.get('/', async (req, res) => {
  const ids = await accessibleJobIds(req.user);
  const filter = { scheduledAt: { $gte: new Date() }, status: 'scheduled', ...(ids ? { job: { $in: ids } } : {}) };
  const interviews = await Interview.find(filter)
    .populate('candidate', 'fullName')
    .populate('job', 'title')
    .populate('interviewer', 'name')
    .sort({ scheduledAt: 1 })
    .limit(20);
  res.json({ interviews });
});

interviewsRouter.patch('/:id', manage, async (req, res) => {
  assertObjectId(req.params.id, 'Interview');
  const data = validate(
    z.object({ status: z.enum(['scheduled', 'completed', 'cancelled']).optional(), scheduledAt: z.coerce.date().optional() }),
    req.body
  );
  const interview = await Interview.findById(req.params.id);
  if (!interview) throw new HttpError(404, 'Interview not found');
  interview.set(data);
  await interview.save();
  await logActivity({
    application: { _id: interview.application, candidate: interview.candidate, job: interview.job },
    actor: req.user,
    type: 'interview_updated',
    message: data.status ? `Marked interview as ${data.status}` : 'Rescheduled an interview',
  });
  res.json({ interview: await interview.populate('interviewer', 'name email') });
});

export default router;
