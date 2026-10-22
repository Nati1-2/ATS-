import { Router } from 'express';
import mongoose from 'mongoose';
import { Candidate, Application, Note, Interview, Activity, STAGES } from '../models/index.js';
import { accessibleJobIds } from '../middleware/auth.js';
import { HttpError, assertObjectId, escapeRegex } from '../utils/http.js';

const router = Router();

const SORTS = {
  score: { 'match.score': -1, createdAt: -1 },
  ai: { 'ai.fitScore': -1, createdAt: -1 }, // applicants without an AI analysis sort last
};

/** One row per application, so a candidate who applied to two jobs appears twice (each with its own stage). */
router.get('/', async (req, res) => {
  const { q, job, stage, keywords, minScore, minAiFit, screening, sort, decision } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

  const match = {};
  const ids = await accessibleJobIds(req.user);
  if (ids) match.job = { $in: ids };
  if (typeof job === 'string' && /^[a-f\d]{24}$/i.test(job)) {
    if (ids && !ids.some((id) => id.toString() === job)) match.job = { $in: [] };
    else match.job = new mongoose.Types.ObjectId(job);
  }
  if (typeof stage === 'string' && STAGES.includes(stage)) match.stage = stage;
  if (screening === 'passed') match.screeningPassed = true;
  if (screening === 'failed') match.screeningPassed = false;
  if (['rejected', 'advanced', 'review'].includes(decision)) match.autoDecision = decision;
  const min = Number(minScore);
  if (minScore && Number.isFinite(min) && min > 0) match['match.score'] = { $gte: Math.min(min, 100) };
  const minAi = Number(minAiFit);
  if (minAiFit && Number.isFinite(minAi) && minAi > 0) match['ai.fitScore'] = { $gte: Math.min(minAi, 100) };
  // CV keyword search: every comma-separated term must appear in the résumé text or cover letter
  if (typeof keywords === 'string' && keywords.trim()) {
    const terms = keywords.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10);
    match.$and = terms.map((t) => {
      const rx = new RegExp(`(?<![a-z0-9])${escapeRegex(t)}(?![a-z0-9])`, 'i');
      return { $or: [{ resumeText: rx }, { coverLetter: rx }] };
    });
  }

  const pipeline = [
    { $match: match },
    { $lookup: { from: 'candidates', localField: 'candidate', foreignField: '_id', as: 'candidate' } },
    { $unwind: '$candidate' },
  ];
  if (typeof q === 'string' && q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i');
    pipeline.push({ $match: { $or: [{ 'candidate.fullName': rx }, { 'candidate.email': rx }] } });
  }
  pipeline.push(
    { $lookup: { from: 'jobs', localField: 'job', foreignField: '_id', as: 'job' } },
    { $unwind: '$job' },
    { $sort: SORTS[sort] ?? { createdAt: -1 } },
    {
      $facet: {
        rows: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              stage: 1,
              createdAt: 1,
              match: { score: 1 },
              screeningPassed: 1,
              autoRejected: 1,
              autoDecision: 1,
              'ai.status': 1,
              'ai.fitLevel': 1,
              'ai.fitScore': 1,
              'aiScreen.action': 1,
              candidate: { _id: 1, fullName: 1, email: 1 },
              job: { _id: 1, title: 1, status: 1 },
            },
          },
        ],
        total: [{ $count: 'n' }],
      },
    }
  );
  const [result] = await Application.aggregate(pipeline);
  res.json({ applications: result.rows, total: result.total[0]?.n ?? 0, page, limit });
});

router.get('/:id', async (req, res) => {
  assertObjectId(req.params.id, 'Candidate');
  const candidate = await Candidate.findById(req.params.id);
  if (!candidate) throw new HttpError(404, 'Candidate not found');

  const ids = await accessibleJobIds(req.user);
  const appFilter = { candidate: candidate._id, ...(ids ? { job: { $in: ids } } : {}) };
  const applications = await Application.find(appFilter)
    .populate('job', 'title department location status')
    .sort({ createdAt: -1 });
  if (ids && applications.length === 0) throw new HttpError(403, 'You are not assigned to any job this candidate applied for');

  const appIds = applications.map((a) => a._id);
  const [notes, interviews, activity] = await Promise.all([
    Note.find({ application: { $in: appIds } }).populate('author', 'name role').sort({ createdAt: -1 }),
    Interview.find({ application: { $in: appIds } }).populate('interviewer', 'name email').sort({ scheduledAt: 1 }),
    Activity.find({ application: { $in: appIds } }).populate('actor', 'name').populate('job', 'title').sort({ createdAt: -1 }),
  ]);

  res.json({
    candidate,
    applications: applications.map((a) => ({
      ...a.toObject(),
      resume: a.resume ? { originalName: a.resume.originalName, mimetype: a.resume.mimetype, size: a.resume.size } : null,
    })),
    notes,
    interviews,
    activity,
  });
});

export default router;
