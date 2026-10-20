import { Router } from 'express';
import { z } from 'zod';
import { Job, Application, User, EMPLOYMENT_TYPES, REMOTE_POLICIES, JOB_STATUSES, AI_SCREEN_MODES } from '../models/index.js';
import { requireRole, accessibleJobIds, assertJobAccess } from '../middleware/auth.js';
import { HttpError, validate, assertObjectId, escapeRegex } from '../utils/http.js';
import { scoreApplication, decideApplication, applyDecision } from '../utils/screening.js';
import { logActivity } from '../utils/activity.js';
import { runAiScreeningForJob } from '../utils/aiScreening.js';
import { enqueueAi } from '../utils/aiQueue.js';

const router = Router();
const manage = requireRole('admin', 'recruiter');

const optionalNumber = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z.number({ invalid_type_error: 'Must be a number' }).nonnegative('Must be 0 or more').optional()
);

const skillList = z
  .array(z.string().trim().min(1).max(60))
  .max(30, 'Up to 30 skills')
  .optional()
  .default([])
  .transform((l) => [...new Set(l)]);

const questionSchema = z
  .object({
    _id: z.string().regex(/^[a-f\d]{24}$/i).optional(),
    question: z.string().trim().min(3, 'Enter the question').max(300),
    type: z.enum(['yes_no', 'number', 'text']),
    required: z.boolean().default(true),
    knockout: z.boolean().default(false),
    expectedAnswer: z.enum(['yes', 'no']).optional(),
    minValue: optionalNumber,
  })
  .transform((q) => ({
    ...q,
    // Knockout rules only make sense for yes/no and number questions
    knockout: q.type !== 'text' && q.knockout,
    expectedAnswer: q.type === 'yes_no' ? (q.expectedAnswer ?? 'yes') : undefined,
    minValue: q.type === 'number' ? q.minValue : undefined,
  }));

const jobSchema = z
  .object({
    title: z.string({ required_error: 'Title is required' }).trim().min(3, 'Title must be at least 3 characters').max(120),
    department: z.string({ required_error: 'Department is required' }).trim().min(1, 'Department is required').max(80),
    location: z.string({ required_error: 'Location is required' }).trim().min(1, 'Location is required').max(120),
    remotePolicy: z.enum(REMOTE_POLICIES, { errorMap: () => ({ message: 'Select a remote policy' }) }),
    employmentType: z.enum(EMPLOYMENT_TYPES, { errorMap: () => ({ message: 'Select an employment type' }) }),
    description: z.string({ required_error: 'Description is required' }).trim().min(20, 'Description must be at least 20 characters').max(20000),
    responsibilities: z.string().trim().max(20000).optional().default(''),
    requirements: z.string().trim().max(20000).optional().default(''),
    salaryMin: optionalNumber,
    salaryMax: optionalNumber,
    currency: z.string().trim().toUpperCase().length(3, 'Use a 3-letter currency code').optional().default('USD'),
    hiringManagers: z.array(z.string()).optional().default([]),
    mustHaveSkills: skillList,
    niceToHaveSkills: skillList,
    screeningQuestions: z.array(questionSchema).max(10, 'Up to 10 questions').optional().default([]),
    autoRejectKnockouts: z.boolean().optional().default(false),
    minYearsExperience: z.preprocess(
      (v) => (v === '' || v == null ? undefined : Number(v)),
      z.number({ invalid_type_error: 'Must be a number' }).min(0, 'Must be 0 or more').max(50, 'Must be 50 or less').optional()
    ),
    minEducation: z.preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      z.enum(['high_school', 'diploma', 'bachelor', 'master', 'phd']).optional()
    ),
    autoScreen: z
      .object({
        rejectBelowScore: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().min(1, '1–100').max(100, '1–100').optional()),
        rejectMissingMustHave: z.boolean().optional().default(false),
        rejectBelowMinYears: z.boolean().optional().default(false),
        rejectMissingEducation: z.boolean().optional().default(false),
        advanceAtScore: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().min(1, '1–100').max(100, '1–100').optional()),
      })
      .refine((r) => r.rejectBelowScore == null || r.advanceAtScore == null || r.advanceAtScore > r.rejectBelowScore, {
        message: 'Shortlist score must be higher than the reject score',
        path: ['advanceAtScore'],
      })
      .optional()
      .default({}),
    aiScreen: z
      .object({
        mode: z.enum(AI_SCREEN_MODES).optional().default('off'),
        rejectBelowFit: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().min(1, '1–100').max(100, '1–100').optional()),
        rejectMissingMustHave: z.boolean().optional().default(false),
        advanceAtFit: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().min(1, '1–100').max(100, '1–100').optional()),
      })
      .refine((r) => r.rejectBelowFit == null || r.advanceAtFit == null || r.advanceAtFit > r.rejectBelowFit, {
        message: 'Shortlist fit must be higher than the reject fit',
        path: ['advanceAtFit'],
      })
      .refine((r) => r.mode === 'off' || r.rejectBelowFit != null || r.advanceAtFit != null || r.rejectMissingMustHave, {
        message: 'Set at least one AI rule, or turn AI screening off',
        path: ['rejectBelowFit'],
      })
      .optional()
      .default({ mode: 'off' }),
    status: z.enum(['draft', 'published']).optional(),
  })
  .refine((d) => d.salaryMin === undefined || d.salaryMax === undefined || d.salaryMin <= d.salaryMax, {
    message: 'Maximum must be greater than or equal to minimum',
    path: ['salaryMax'],
  });

async function cleanHiringManagers(ids) {
  const valid = ids.filter((id) => /^[a-f\d]{24}$/i.test(id));
  const users = await User.find({ _id: { $in: valid }, role: 'hiring_manager', active: true }).select('_id');
  return users.map((u) => u._id);
}

async function withApplicationCounts(jobs) {
  const counts = await Application.aggregate([
    { $match: { job: { $in: jobs.map((j) => j._id) } } },
    { $group: { _id: '$job', count: { $sum: 1 } } },
  ]);
  const map = new Map(counts.map((c) => [c._id.toString(), c.count]));
  return jobs.map((j) => ({ ...j.toObject(), applicationCount: map.get(j._id.toString()) ?? 0 }));
}

router.get('/', async (req, res) => {
  const { q, status } = req.query;
  const filter = {};
  const ids = await accessibleJobIds(req.user);
  if (ids) filter._id = { $in: ids };
  if (typeof status === 'string' && JOB_STATUSES.includes(status)) filter.status = status;
  if (typeof q === 'string' && q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i');
    filter.$or = [{ title: rx }, { department: rx }, { location: rx }];
  }
  const jobs = await Job.find(filter).sort({ updatedAt: -1 });
  res.json({ jobs: await withApplicationCounts(jobs) });
});

router.post('/', manage, async (req, res) => {
  const data = validate(jobSchema, req.body);
  const status = data.status ?? 'draft';
  const job = await Job.create({
    ...data,
    status,
    hiringManagers: await cleanHiringManagers(data.hiringManagers),
    publishedAt: status === 'published' ? new Date() : undefined,
    createdBy: req.user._id,
  });
  res.status(201).json({ job });
});

async function loadJob(req) {
  assertObjectId(req.params.id, 'Job');
  const job = await Job.findById(req.params.id).populate('hiringManagers', 'name email');
  if (!job) throw new HttpError(404, 'Job not found');
  await assertJobAccess(req.user, job._id);
  return job;
}

router.get('/:id', async (req, res) => {
  const job = await loadJob(req);
  const stages = await Application.aggregate([{ $match: { job: job._id } }, { $group: { _id: '$stage', count: { $sum: 1 } } }]);
  res.json({
    job: { ...job.toObject(), applicationCount: stages.reduce((s, x) => s + x.count, 0) },
    stageCounts: Object.fromEntries(stages.map((s) => [s._id, s.count])),
  });
});

router.put('/:id', manage, async (req, res) => {
  const job = await loadJob(req);
  const data = validate(jobSchema, req.body);
  const { status, hiringManagers, ...fields } = data;
  const scoringInputs = (j) => JSON.stringify([j.title, j.mustHaveSkills, j.niceToHaveSkills, j.minYearsExperience ?? null, j.minEducation ?? null]);
  const scoringBefore = scoringInputs(job);
  // Explicitly clear optional salary fields when emptied
  job.set({
    ...fields,
    salaryMin: fields.salaryMin ?? undefined,
    salaryMax: fields.salaryMax ?? undefined,
    minYearsExperience: fields.minYearsExperience ?? undefined,
    minEducation: fields.minEducation ?? undefined,
  });
  job.autoScreen = {
    rejectBelowScore: fields.autoScreen.rejectBelowScore ?? undefined,
    rejectMissingMustHave: fields.autoScreen.rejectMissingMustHave,
    rejectBelowMinYears: fields.autoScreen.rejectBelowMinYears,
    rejectMissingEducation: fields.autoScreen.rejectMissingEducation,
    advanceAtScore: fields.autoScreen.advanceAtScore ?? undefined,
  };
  job.aiScreen = {
    mode: fields.aiScreen.mode,
    rejectBelowFit: fields.aiScreen.rejectBelowFit ?? undefined,
    rejectMissingMustHave: fields.aiScreen.rejectMissingMustHave,
    advanceAtFit: fields.aiScreen.advanceAtFit ?? undefined,
  };
  job.hiringManagers = await cleanHiringManagers(hiringManagers);
  if (status === 'published' && job.status !== 'published') {
    job.status = 'published';
    job.publishedAt = new Date();
    job.closedAt = undefined;
  }
  await job.save();
  const rescored = scoringBefore !== scoringInputs(job) ? await rescoreJob(job) : 0;
  res.json({ job, rescored });
});

/** Re-run skill matching for every application on a job using the stored CV text. */
async function rescoreJob(job) {
  const apps = await Application.find({ job: job._id }).select('+resumeText coverLetter');
  for (const app of apps) {
    const match = scoreApplication(job, { resumeText: app.resumeText, coverLetter: app.coverLetter });
    app.match = match ?? undefined;
    await app.save();
  }
  return apps.length;
}

router.post('/:id/publish', manage, async (req, res) => {
  const job = await loadJob(req);
  job.status = 'published';
  job.publishedAt = new Date();
  job.closedAt = undefined;
  await job.save();
  res.json({ job });
});

router.post('/:id/close', manage, async (req, res) => {
  const job = await loadJob(req);
  job.status = 'closed';
  job.closedAt = new Date();
  await job.save();
  res.json({ job });
});

/**
 * Run the job's automatic rules on applications still waiting in "Applied".
 * Anyone a recruiter has already moved is left alone.
 */
router.post('/:id/run-screening', manage, async (req, res) => {
  const job = await loadJob(req);
  const apps = await Application.find({ job: job._id, stage: 'applied', stageSetBy: { $ne: 'human' } }).select('+resumeText');
  const counts = { rejected: 0, advanced: 0, review: 0 };
  for (const app of apps) {
    const result = decideApplication(job, {
      match: app.match?.score != null ? app.match : null,
      screeningPassed: app.screeningPassed,
      resumeReadable: app.resumeTextExtracted !== false && Boolean(app.resumeText),
    });
    const activity = applyDecision(app, result);
    await app.save();
    counts[app.autoDecision] += 1;
    if (activity) await logActivity({ application: app, actor: req.user, ...activity });
  }
  res.json({ processed: apps.length, ...counts });
});

/** Run the job's AI screening rules on applicants in Applied (queues AI analysis where it's missing). */
router.post('/:id/run-ai-screening', manage, async (req, res) => {
  const job = await loadJob(req);
  if (!job.aiScreen?.mode || job.aiScreen.mode === 'off') throw new HttpError(400, 'Turn on AI screening for this job first');
  res.json(await runAiScreeningForJob(job, req.user, { enqueue: enqueueAi }));
});

export default router;
