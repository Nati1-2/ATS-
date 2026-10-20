import { Router } from 'express';
import path from 'node:path';
import { z } from 'zod';
import { Application, CvCheck, Job } from '../models/index.js';
import { assertJobAccess } from '../middleware/auth.js';
import { aiCvCheckLimiter } from '../middleware/rateLimits.js';
import { HttpError, validate, assertObjectId } from '../utils/http.js';
import { resumeUpload, verifyResumeSignature, removeFile, UPLOAD_DIR } from '../utils/uploads.js';
import { extractResumeText } from '../utils/screening.js';
import { aiEnabled, resumeFilePath } from '../utils/ai.js';
import { quickChecks, reviewCv } from '../utils/cvChecker.js';

const router = Router();

const optionalId = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().regex(/^[a-f\d]{24}$/i).optional());
const checkSchema = z.object({
  applicationId: optionalId,
  jobId: optionalId,
  targetRole: z.string().trim().max(200).optional().default(''),
  text: z.string().trim().max(60_000).optional().default(''),
});

const LIST_FIELDS = 'source fileName candidateName jobTitle targetRole quick.score review.overallScore review.headline aiStatus createdAt';

// Check a CV: an uploaded file, pasted text, or an applicant's CV. Optional target job or role.
router.post('/', aiCvCheckLimiter, resumeUpload.single('resume'), async (req, res) => {
  const file = req.file;
  try {
    const body = validate(checkSchema, req.body ?? {});
    let text = '';
    let pdfPath = null;
    let source;
    const meta = {};

    if (file) {
      if (!verifyResumeSignature(file.path)) throw new HttpError(400, 'Please correct the highlighted fields', { resume: 'This file is damaged or is not really the type its name says' });
      source = 'upload';
      meta.fileName = file.originalname;
      text = await extractResumeText(file.path);
      if (!text && path.extname(file.filename) === '.pdf') pdfPath = file.path;
    } else if (body.applicationId) {
      const app = await Application.findById(body.applicationId).select('+resumeText').populate('candidate', 'fullName');
      if (!app) throw new HttpError(404, 'Application not found');
      await assertJobAccess(req.user, app.job);
      source = 'application';
      Object.assign(meta, { application: app._id, candidateName: app.candidate?.fullName, fileName: app.resume?.originalName });
      text = app.resumeText || '';
      if (!text && app.resume?.mimetype === 'application/pdf') pdfPath = resumeFilePath(UPLOAD_DIR, app.resume.filename);
    } else if (body.text) {
      if (body.text.length < 100) throw new HttpError(400, 'Please correct the highlighted fields', { text: 'Paste the whole CV (at least 100 characters)' });
      source = 'paste';
      text = body.text;
    } else {
      throw new HttpError(400, 'Please correct the highlighted fields', { resume: 'Upload a CV, paste its text, or choose an applicant' });
    }

    let job = null;
    if (body.jobId) {
      job = await Job.findById(body.jobId);
      if (!job) throw new HttpError(404, 'Job not found');
      await assertJobAccess(req.user, job._id);
    }

    const quick = quickChecks(text, job);
    const ai = aiEnabled() && (text || pdfPath) ? await reviewCv({ text, pdfPath, job, targetRole: body.targetRole }) : { status: 'disabled' };
    const check = await CvCheck.create({
      createdBy: req.user._id,
      source,
      ...meta,
      job: job?._id,
      jobTitle: job?.title,
      targetRole: job ? undefined : body.targetRole || undefined,
      quick,
      review: ai.review,
      aiStatus: ai.status,
      aiError: ai.error,
      model: ai.model,
    });
    res.status(201).json({ check });
  } finally {
    // Uploaded files are only read, never kept
    if (file) removeFile(file.path);
  }
});

// Your recent checks
router.get('/', async (req, res) => {
  const checks = await CvCheck.find({ createdBy: req.user._id }).select(LIST_FIELDS).sort({ createdAt: -1 }).limit(30).lean();
  res.json({ checks, aiEnabled: aiEnabled() });
});

router.get('/:id', async (req, res) => {
  assertObjectId(req.params.id, 'CV check');
  const check = await CvCheck.findOne({ _id: req.params.id, createdBy: req.user._id }).lean();
  if (!check) throw new HttpError(404, 'CV check not found');
  res.json({ check });
});

router.delete('/:id', async (req, res) => {
  assertObjectId(req.params.id, 'CV check');
  const r = await CvCheck.deleteOne({ _id: req.params.id, createdBy: req.user._id });
  if (!r.deletedCount) throw new HttpError(404, 'CV check not found');
  res.json({ ok: true });
});

export default router;
