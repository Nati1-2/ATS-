import { Router } from 'express';
import mongoose from 'mongoose';
import { Application, Job } from '../models/index.js';
import { HttpError } from '../utils/http.js';
import { rateCv } from '../utils/atsScore.js';
import { extractResumeText } from '../utils/screening.js';
import { resumeUpload, verifyResumeSignature, removeFile } from '../utils/uploads.js';

const router = Router();

// The checks are run on the fly, so only the most recent applications are filtered
const MAX_SCANNED = 500;

// Text read from a scanned PDF by AI is not what an ATS would see, so it counts as unreadable here
const atsText = (app) => (app.resumeTextSource === 'ai' ? '' : app.resumeText);

// Ratings are kept per version of the application and of the job (and per month, as "Present" dates grow),
// so filtering, sorting and paging don't re-read and re-rate every CV
const CACHE_MAX = 5000;
const ratings = new Map();
const stamp = (d) => (d ? new Date(d).getTime() : 0);
const ratingKey = (app, job) => `${app._id}:${stamp(app.updatedAt)}:${job?._id ?? ''}:${stamp(job?.updatedAt)}:${new Date().toISOString().slice(0, 7)}`;
function remember(key, value) {
  ratings.delete(key);
  ratings.set(key, value);
  if (ratings.size > CACHE_MAX) ratings.delete(ratings.keys().next().value);
  return value;
}

/** The parts of the ATS rating the list shows. */
function summarise(rating) {
  return {
    atsScore: rating.score,
    grade: rating.grade,
    decision: rating.decision,
    keywordScore: rating.components.find((c) => c.key === 'requirements')?.score ?? null,
    knockouts: rating.knockouts,
    holds: rating.holds ?? [],
    components: rating.components.map(({ key, label, weight, score, detail }) => ({ key, label, weight, score, detail })),
    keywords: rating.keywords,
    improvements: rating.improvements.map(({ id, area, severity, knockout, problem, fix, gain }) => ({ id, area, severity, knockout, problem, fix, gain })),
    checks: rating.checks.map(({ id, label, status }) => ({ id, label, status })),
  };
}

/**
 * ATS CV Filter: filter applicants' CVs by a rule-based ATS rating (utils/atsScore.js), never AI.
 * Filters: job, result (ATS decision: pass / review / reject), minAts (ATS score), mustPass (a check id that must pass), sort.
 */
router.get('/', async (req, res) => {
  const { job, result, minAts, mustPass, sort } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

  const match = {};
  if (typeof job === 'string' && /^[a-f\d]{24}$/i.test(job)) match.job = new mongoose.Types.ObjectId(job);

  // CV text is only loaded for CVs not rated yet
  const apps = await Application.find(match)
    .select('stage createdAt updatedAt candidate job resume.originalName')
    .populate('candidate', 'fullName email')
    .sort({ createdAt: -1 })
    .limit(MAX_SCANNED)
    .lean();
  const jobIds = [...new Set(apps.map((a) => a.job?.toString()).filter(Boolean))];
  const jobs = new Map((await Job.find({ _id: { $in: jobIds } }).lean()).map((j) => [j._id.toString(), j]));
  const jobOf = (a) => jobs.get(a.job?.toString()) ?? null;

  const rated = new Map();
  for (const a of apps) {
    const key = ratingKey(a, jobOf(a));
    if (a.candidate && ratings.has(key)) rated.set(a._id.toString(), remember(key, ratings.get(key)));
  }
  const unrated = apps.filter((a) => a.candidate && !rated.has(a._id.toString()));
  if (unrated.length) {
    const texts = new Map(
      (await Application.find({ _id: { $in: unrated.map((a) => a._id) } }).select('+resumeText resumeTextSource').lean()).map((a) => [a._id.toString(), a])
    );
    for (const [i, a] of unrated.entries()) {
      const j = jobOf(a);
      rated.set(a._id.toString(), remember(ratingKey(a, j), summarise(rateCv(atsText(texts.get(a._id.toString()) ?? {}), j, { fileName: a.resume?.originalName }))));
      // Let other requests run while a large batch is rated
      if (i % 50 === 49) await new Promise((r) => setImmediate(r));
    }
  }

  let rows = apps
    .filter((a) => a.candidate)
    .map((a) => {
      const j = jobOf(a);
      return {
        _id: a._id,
        stage: a.stage,
        createdAt: a.createdAt,
        candidate: a.candidate,
        job: j && { _id: j._id, title: j.title },
        fileName: a.resume?.originalName,
        ...rated.get(a._id.toString()),
      };
    });

  const min = Number(minAts);
  if (minAts && Number.isFinite(min) && min > 0) rows = rows.filter((r) => r.atsScore >= min);
  if (typeof mustPass === 'string' && mustPass) rows = rows.filter((r) => r.checks.some((c) => c.id === mustPass && c.status === 'pass'));
  // Decision counts are taken before the decision filter, so the tabs always show every bucket
  const decisions = { pass: 0, review: 0, reject: 0 };
  for (const r of rows) decisions[r.decision]++;
  const counted = rows.length;
  if (['pass', 'review', 'reject'].includes(result)) rows = rows.filter((r) => r.decision === result);
  if (sort === 'ats') rows.sort((a, b) => b.atsScore - a.atsScore);
  if (sort === 'keywords') rows.sort((a, b) => (b.keywordScore ?? -1) - (a.keywordScore ?? -1));

  res.json({
    applications: rows.slice((page - 1) * limit, page * limit),
    total: rows.length,
    decisions,
    counted,
    scanned: apps.length,
    capped: apps.length === MAX_SCANNED,
    page,
    limit,
  });
});

// Rate an uploaded CV with the ATS rules only (optionally against a job). Nothing is stored and no AI is called.
router.post('/check', resumeUpload.single('resume'), async (req, res) => {
  const file = req.file;
  try {
    if (!file) throw new HttpError(400, 'Please correct the highlighted fields', { resume: 'Choose a CV file' });
    if (!verifyResumeSignature(file.path)) throw new HttpError(400, 'Please correct the highlighted fields', { resume: 'This file is damaged or is not really the type its name says' });
    let job = null;
    if (req.body?.jobId) {
      if (!/^[a-f\d]{24}$/i.test(req.body.jobId)) throw new HttpError(400, 'Please correct the highlighted fields', { jobId: 'Choose a job from the list' });
      job = await Job.findById(req.body.jobId);
      if (!job) throw new HttpError(404, 'Job not found');
    }
    const text = await extractResumeText(file.path);
    res.json({ result: { fileName: file.originalname, jobTitle: job?.title, ...rateCv(text, job, { fileName: file.originalname }) } });
  } finally {
    // Uploaded files are only read, never kept
    if (file) removeFile(file.path);
  }
});

export default router;
