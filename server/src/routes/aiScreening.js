import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Application, Candidate, Job } from '../models/index.js';
import { accessibleJobIds, requireRole } from '../middleware/auth.js';
import { HttpError, validate, assertObjectId, escapeRegex } from '../utils/http.js';
import { logActivity } from '../utils/activity.js';
import { AI_SCREEN_VIEWS, reviewAiDecision } from '../utils/aiScreening.js';

const router = Router();
const manage = requireRole('admin', 'recruiter');

async function scope(user, job) {
  const ids = await accessibleJobIds(user);
  if (typeof job === 'string' && job) {
    assertObjectId(job, 'Job');
    if (ids && !ids.some((id) => id.toString() === job)) throw new HttpError(404, 'Job not found');
    return { job: new mongoose.Types.ObjectId(job) };
  }
  return ids ? { job: { $in: ids } } : {};
}

async function countViews(filter) {
  const entries = await Promise.all(Object.entries(AI_SCREEN_VIEWS).map(async ([k, f]) => [k, await Application.countDocuments({ ...filter, ...f })]));
  return Object.fromEntries(entries);
}

// Number waiting for a recruiter, for the sidebar badge
router.get('/summary', async (req, res) => {
  const filter = await scope(req.user);
  res.json({ pending: await Application.countDocuments({ ...filter, ...AI_SCREEN_VIEWS.pending }) });
});

router.get('/', async (req, res) => {
  const { view = 'pending', job, q } = req.query;
  if (!AI_SCREEN_VIEWS[view]) throw new HttpError(400, 'Unknown view');
  const filter = await scope(req.user, job);
  const where = { ...filter, ...AI_SCREEN_VIEWS[view] };
  if (typeof q === 'string' && q.trim()) {
    const people = await Candidate.find({ fullName: new RegExp(escapeRegex(q.trim()), 'i') }).select('_id').limit(500);
    where.candidate = { $in: people.map((p) => p._id) };
  }

  const ids = await accessibleJobIds(req.user);
  const [items, counts, outcomes, jobs] = await Promise.all([
    Application.find(where)
      .populate('candidate', 'fullName')
      .populate('job', 'title')
      .select('candidate job stage match.score ai.status ai.fitScore ai.fitLevel ai.summary ai.model aiScreen screeningPassed resumeTextSource createdAt')
      .sort(view === 'reviewed' ? { 'aiScreen.review.at': -1 } : { 'aiScreen.decidedAt': -1 })
      .limit(200),
    countViews(filter),
    Application.aggregate([
      { $match: { ...filter, 'aiScreen.review': { $exists: true } } },
      { $group: { _id: { action: '$aiScreen.action', outcome: '$aiScreen.review.outcome' }, count: { $sum: 1 } } },
    ]),
    Job.find({ ...(ids ? { _id: { $in: ids } } : {}), status: { $ne: 'draft' } })
      .select('title status aiScreen')
      .sort({ title: 1 }),
  ]);

  // How often people disagree with the AI: a quick health check on the thresholds
  const stat = (action) => {
    const rows = outcomes.filter((o) => (action === 'reject' ? ['rejected', 'pending_reject'] : ['advanced']).includes(o._id.action));
    const confirmed = rows.filter((o) => o._id.outcome === 'confirmed').reduce((s, o) => s + o.count, 0);
    const overturned = rows.filter((o) => o._id.outcome === 'overturned').reduce((s, o) => s + o.count, 0);
    return { confirmed, overturned, overturnRate: confirmed + overturned ? Math.round((overturned / (confirmed + overturned)) * 100) : null };
  };
  res.json({ items, counts, accuracy: { reject: stat('reject'), advance: stat('advanced') }, jobs });
});

const reviewSchema = z.object({
  ids: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1, 'Select at least one candidate').max(200),
  outcome: z.enum(['confirmed', 'overturned']),
});

// Confirm or overturn AI decisions, one or many at a time
router.post('/review', manage, async (req, res) => {
  const { ids, outcome } = validate(reviewSchema, req.body);
  const filter = await scope(req.user);
  const apps = await Application.find({ ...filter, _id: { $in: ids } });
  let updated = 0;
  for (const app of apps) {
    const activity = reviewAiDecision(app, outcome, req.user);
    if (!activity) continue;
    await app.save();
    await logActivity({ application: app, actor: req.user, ...activity });
    updated += 1;
  }
  res.json({ updated, skipped: ids.length - updated });
});

export default router;
