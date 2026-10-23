import { Router } from 'express';
import { z } from 'zod';
import { Job, Candidate, Application, getCompany } from '../models/index.js';
import { HttpError, validate, assertObjectId, escapeRegex } from '../utils/http.js';
import { resumeUpload, verifyResumeSignature, persistFile, fetchFile, deleteStoredFile, MAX_RESUME_MB, RESUME_MIME } from '../utils/uploads.js';
import path from 'node:path';
import { logActivity } from '../utils/activity.js';
import { applyLimiter } from '../middleware/rateLimits.js';
import { currentSeeker } from '../middleware/seekerAuth.js';
import { aiEnabled } from '../utils/ai.js';
import { enqueueAi } from '../utils/aiQueue.js';
import { extractResumeText, scoreApplication, evaluateScreening, decideApplication, applyDecision } from '../utils/screening.js';

const router = Router();

const PUBLIC_JOB_FIELDS =
  'title department location remotePolicy employmentType description responsibilities requirements salaryMin salaryMax currency status publishedAt';

export const publicCompany = (c) => ({
  name: c.name,
  description: c.description,
  website: c.website,
  contactEmail: c.contactEmail,
  phone: c.phone,
  address: c.address,
  careersHeadline: c.careersHeadline,
  careersIntro: c.careersIntro,
  benefits: c.benefits ?? [],
  logoUrl: c.logo?.filename ? `/api/public/logo?v=${c.updatedAt?.getTime() ?? 0}` : null,
});

router.get('/company', async (_req, res) => {
  res.json({ company: publicCompany(await getCompany()), maxResumeMb: MAX_RESUME_MB });
});

router.get('/logo', async (_req, res) => {
  const company = await getCompany();
  const filePath = company.logo?.filename && (await fetchFile('logos', company.logo.filename));
  if (!filePath) throw new HttpError(404, 'No logo');
  res.type(company.logo.mimetype);
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'"); // safe SVG serving
  res.sendFile(filePath);
});

router.get('/jobs', async (req, res) => {
  const { q, department, location, employmentType } = req.query;
  const filter = { status: 'published' };
  if (typeof q === 'string' && q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i');
    filter.$or = [{ title: rx }, { department: rx }, { location: rx }];
  }
  if (typeof department === 'string' && department) filter.department = department;
  if (typeof location === 'string' && location) filter.location = location;
  if (typeof employmentType === 'string' && employmentType) filter.employmentType = employmentType;

  const [jobs, departments, locations, employmentTypes, total, remotePolicies] = await Promise.all([
    Job.find(filter).select(PUBLIC_JOB_FIELDS).sort({ publishedAt: -1 }),
    Job.distinct('department', { status: 'published' }),
    Job.distinct('location', { status: 'published' }),
    Job.distinct('employmentType', { status: 'published' }),
    Job.countDocuments({ status: 'published' }),
    Job.distinct('remotePolicy', { status: 'published' }),
  ]);
  res.json({ jobs, total, facets: { departments: departments.sort(), locations: locations.sort(), employmentTypes, remotePolicies } });
});

async function findPublicJob(id) {
  assertObjectId(id, 'Job');
  const job = await Job.findOne({ _id: id, status: { $in: ['published', 'closed'] } }).select(PUBLIC_JOB_FIELDS);
  if (!job) throw new HttpError(404, 'Job not found');
  return job;
}

router.get('/jobs/:id', async (req, res) => {
  const job = await findPublicJob(req.params.id);
  // Expose the questions only — never which answers knock a candidate out.
  const questions = await Job.findById(job._id).select('screeningQuestions aiScreen.mode');
  res.json({
    job: {
      ...job.toObject(),
      // Applicants are told whether AI screening is used (not its thresholds), as transparency rules expect
      aiScreening: questions.aiScreen?.mode || 'off',
      screeningQuestions: questions.screeningQuestions.map((q) => ({ _id: q._id, question: q.question, type: q.type, required: q.required })),
    },
    maxResumeMb: MAX_RESUME_MB,
  });
});

const applySchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(200),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+\d\s().-]*$/, 'Enter a valid phone number')
    .optional()
    .default(''),
  coverLetter: z.string().trim().max(5000, 'Cover letter must be 5000 characters or fewer').optional().default(''),
  answers: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return {};
      try {
        const parsed = JSON.parse(v);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch {
        /* fall through */
      }
      ctx.addIssue({ code: 'custom', message: 'Invalid answers' });
      return z.NEVER;
    }),
});


router.post('/jobs/:id/apply', applyLimiter, resumeUpload.single('resume'), async (req, res) => {
  const file = req.file;
  try {
    const job = await findPublicJob(req.params.id);
    if (job.status !== 'published') throw new HttpError(400, 'This job is closed and no longer accepting applications');
    const body = validate(applySchema, req.body ?? {});
    if (!file) throw new HttpError(400, 'Please correct the highlighted fields', { resume: 'A résumé is required' });
    if (!verifyResumeSignature(file.path)) {
      throw new HttpError(400, 'Please correct the highlighted fields', { resume: 'This file is damaged or is not really the type its name says' });
    }

    const fullJob = await Job.findById(job._id).select('title mustHaveSkills niceToHaveSkills minYearsExperience minEducation screeningQuestions autoRejectKnockouts autoScreen');
    const screening = evaluateScreening(fullJob.screeningQuestions, body.answers);
    if (Object.keys(screening.errors).length) throw new HttpError(400, 'Please answer the required questions', screening.errors);

    const candidate = await Candidate.findOneAndUpdate(
      { email: body.email },
      { $set: { fullName: body.fullName, ...(body.phone ? { phone: body.phone } : {}) }, $setOnInsert: { email: body.email } },
      { upsert: true, new: true }
    );
    if (await Application.exists({ candidate: candidate._id, job: job._id })) {
      throw new HttpError(409, 'You have already applied for this job with this email address');
    }

    const resumeText = await extractResumeText(file.path, file.mimetype);
    const match = scoreApplication(fullJob, { resumeText, coverLetter: body.coverLetter });
    const application = new Application({
      candidate: candidate._id,
      job: job._id,
      coverLetter: body.coverLetter,
      resume: { filename: file.filename, originalName: file.originalname, mimetype: RESUME_MIME[path.extname(file.filename)], size: file.size },
      resumeText,
      resumeTextExtracted: resumeText.length > 0,
      match: match ?? undefined,
      screeningAnswers: screening.answers,
      screeningPassed: screening.passed,
      seeker: (await currentSeeker(req))?._id, // shows on the job seeker's dashboard when signed in
    });
    application.ai = { status: aiEnabled() ? 'pending' : 'disabled' };
    const decision = applyDecision(
      application,
      decideApplication(fullJob, { match, screeningPassed: screening.passed, resumeReadable: resumeText.length > 0 })
    );
    await persistFile('resumes', file);
    await application.save();
    await logActivity({ application, type: 'applied', message: `Applied for ${job.title}${match ? ` (match ${match.score}%)` : ''}` });
    if (decision) await logActivity({ application, ...decision });
    enqueueAi(application._id); // AI analysis runs in the background after we respond
    // The applicant always sees the same confirmation, whatever the screening outcome.
    res.status(201).json({ ok: true, applicationId: application._id });
  } catch (err) {
    if (file) await deleteStoredFile('resumes', file.filename);
    throw err;
  }
});

export default router;
