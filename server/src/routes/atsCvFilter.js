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

  const apps = await Application.find(match)
    .select('+resumeText resumeTextSource stage createdAt candidate job resume.originalName')
    .populate('candidate', 'fullName email')
    .sort({ createdAt: -1 })
    .limit(MAX_SCANNED)
    .lean();
  const jobIds = [...new Set(apps.map((a) => a.job?.toString()).filter(Boolean))];
  const jobs = new Map((await Job.find({ _id: { $in: jobIds } }).lean()).map((j) => [j._id.toString(), j]));

  let rows = apps
    .filter((a) => a.candidate)
    .map((a) => {
      const j = jobs.get(a.job?.toString()) ?? null;
      const rating = rateCv(atsText(a), j, { fileName: a.resume?.originalName });
      return {
        _id: a._id,
        stage: a.stage,
        createdAt: a.createdAt,
        candidate: a.candidate,
        job: j && { _id: j._id, title: j.title },
        fileName: a.resume?.originalName,
        atsScore: rating.score,
        grade: rating.grade,
        decision: rating.decision,
        keywordScore: rating.components.find((c) => c.key === 'requirements')?.score ?? null,
        knockouts: rating.knockouts,
        components: rating.components.map(({ key, label, weight, score, detail }) => ({ key, label, weight, score, detail })),
        keywords: rating.keywords,
        improvements: rating.improvements.map(({ id, area, severity, knockout, problem, fix, gain }) => ({ id, area, severity, knockout, problem, fix, gain })),
        checks: rating.checks.map(({ id, label, status }) => ({ id, label, status })),
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
