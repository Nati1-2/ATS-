import { Router } from 'express';
import path from 'node:path';
import { z } from 'zod';
import { Application, CvCheck, Job } from '../models/index.js';
import { assertJobAccess } from '../middleware/auth.js';
import { aiChatLimiter, aiCvCheckLimiter } from '../middleware/rateLimits.js';
import { HttpError, validate, assertObjectId } from '../utils/http.js';
import { resumeUpload, verifyResumeSignature, removeFile, fetchFile } from '../utils/uploads.js';
import { extractResumeText } from '../utils/screening.js';
import { aiEnabled } from '../utils/ai.js';
import { quickChecks, reviewCv } from '../utils/cvChecker.js';
import { aiQualityOf, rateCv } from '../utils/atsScore.js';
import { askAboutCv } from '../utils/cvChat.js';
import { fixCv, cvToDocx } from '../utils/cvFixer.js';
import { inBackground } from '../utils/aiQueue.js';

const router = Router();

const optionalId = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().regex(/^[a-f\d]{24}$/i).optional());
const checkSchema = z.object({
  applicationId: optionalId,
  jobId: optionalId,
  targetRole: z.string().trim().max(200).optional().default(''),
  text: z.string().trim().max(60_000).optional().default(''),
});

// A review still 'pending' after this long was cut short (for example by a restart)
const STALE_REVIEW_MS = 3 * 60 * 1000;

/** The AI review, run after the response is sent. The uploaded file (if any) is deleted at the end. */
async function finishReview(checkId, { text, pdfPath, job, targetRole, file, ats, fileName }) {
  try {
    const ai = await reviewCv({ text, pdfPath, job, targetRole, ats });
    const $set = { review: ai.review, aiStatus: ai.status, aiError: ai.error, model: ai.model };
    // Re-rate with the AI's role keywords and writing-quality score, unless the CV tried to steer the AI
    if (ai.review) $set.ats = rateCv(text, job, { fileName, roleKeywords: ai.review.roleKeywords, aiQuality: ai.review.injectionAttempt ? null : aiQualityOf(ai.review) });
    await CvCheck.updateOne({ _id: checkId }, { $set });
  } catch (err) {
    console.error(`[cv checker] ${checkId}: ${err.message}`);
    await CvCheck.updateOne({ _id: checkId }, { $set: { aiStatus: 'failed', aiError: 'The AI review could not be completed' } }).catch(() => {});
  } finally {
    if (file) removeFile(file.path);
  }
}

/** The AI rewrite, run after the response is sent. */
async function finishFix(checkId, input) {
  try {
    const out = await fixCv(input);
    await CvCheck.updateOne({ _id: checkId }, { $set: { 'fix.status': out.status, 'fix.result': out.result, 'fix.error': out.error, 'fix.model': out.model } });
  } catch (err) {
    console.error(`[cv fixer] ${checkId}: ${err.message}`);
    await CvCheck.updateOne({ _id: checkId }, { $set: { 'fix.status': 'failed', 'fix.error': 'The CV could not be rewritten' } }).catch(() => {});
  }
}

const fixSchema = z.object({
  items: z.array(z.string().trim().min(1).max(600)).min(1, 'Choose at least one thing to fix').max(25),
  skills: z.array(z.string().trim().min(1).max(60)).max(15).optional().default([]),
  notes: z.string().trim().max(3000).optional().default(''),
});

/** The CV text to rewrite: saved with the check, or (for checks made before it was saved) the applicant's CV on file. */
async function savedCvText(check) {
  if (check.cvText) return check.cvText;
  if (check.application) {
    const app = await Application.findById(check.application).select('+resumeText resumeTextSource').lean();
    if (app?.resumeText) return app.resumeText;
  }
  return '';
}

const LIST_FIELDS = 'source fileName candidateName jobTitle targetRole quick.score ats.score review.overallScore review.headline aiStatus createdAt';

// Check a CV: an uploaded file, pasted text, or an applicant's CV. Optional target job or role.
// Replies with the quick checks straight away; the AI review is added in the background (poll GET /:id).
router.post('/', aiCvCheckLimiter, resumeUpload.single('resume'), async (req, res) => {
  const file = req.file;
  let handedOff = false;
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
      if (!text && app.resume?.mimetype === 'application/pdf') pdfPath = await fetchFile('resumes', app.resume.filename);
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
    const ats = rateCv(text, job, { fileName: meta.fileName });
    const runAi = aiEnabled() && Boolean(text || pdfPath);
    const check = await CvCheck.create({
      createdBy: req.user._id,
      source,
      ...meta,
      job: job?._id,
      jobTitle: job?.title,
      targetRole: job ? undefined : body.targetRole || undefined,
      quick,
      ats,
      cvText: text || undefined,
      aiStatus: runAi ? 'pending' : 'disabled',
    });
    if (runAi) {
      inBackground(finishReview(check._id, { text, pdfPath, job, targetRole: body.targetRole, file, ats, fileName: meta.fileName }));
      handedOff = true;
    }
    res.status(201).json({ check });
  } finally {
    // Uploaded files are only read, never kept
    if (file && !handedOff) removeFile(file.path);
  }
});

// Your recent checks
router.get('/', async (req, res) => {
  const checks = await CvCheck.find({ createdBy: req.user._id }).select(LIST_FIELDS).sort({ createdAt: -1 }).limit(30).lean();
  res.json({ checks, aiEnabled: aiEnabled() });
});

router.get('/:id', async (req, res) => {
  assertObjectId(req.params.id, 'CV check');
  const found = await CvCheck.findOne({ _id: req.params.id, createdBy: req.user._id }).select('+cvText').lean();
  if (!found) throw new HttpError(404, 'CV check not found');
  const { cvText, ...check } = found;
  // Without saved text (checks made before CV fixing existed) the CV has to be uploaded again to be rewritten
  check.hasCvText = Boolean(cvText) || Boolean(check.application && (await savedCvText(found)));
  if (check.aiStatus === 'pending' && Date.now() - new Date(check.createdAt).getTime() > STALE_REVIEW_MS) {
    Object.assign(check, { aiStatus: 'failed', aiError: 'The AI review took too long' });
  }
  if (check.fix?.status === 'pending' && Date.now() - new Date(check.fix.startedAt).getTime() > STALE_REVIEW_MS) {
    Object.assign(check.fix, { status: 'failed', error: 'The rewrite took too long' });
  }
  res.json({ check });
});

// After the person confirms what to fix: rewrite the CV with AI in the background (poll GET /:id for `fix`)
// JSON, or multipart with the CV file again (`resume`) and the same fields as JSON in `payload`.
router.post('/:id/fix', aiCvCheckLimiter, resumeUpload.single('resume'), async (req, res) => {
  const file = req.file;
  try {
    assertObjectId(req.params.id, 'CV check');
    let raw = req.body ?? {};
    if (file) {
      try {
        raw = JSON.parse(req.body?.payload || '{}');
      } catch {
        throw new HttpError(400, 'Invalid request');
      }
    }
    const body = validate(fixSchema, raw);
    if (!aiEnabled()) throw new HttpError(400, 'AI isn’t set up on this server, so CVs can’t be rewritten');
    const check = await CvCheck.findOne({ _id: req.params.id, createdBy: req.user._id }).select('+cvText');
    if (!check) throw new HttpError(404, 'CV check not found');
    if (check.fix?.status === 'pending' && Date.now() - check.fix.startedAt.getTime() < STALE_REVIEW_MS) throw new HttpError(409, 'The CV is already being rewritten');

    let text = await savedCvText(check);
    if (file) {
      if (!verifyResumeSignature(file.path)) throw new HttpError(400, 'Please correct the highlighted fields', { resume: 'This file is damaged or is not really the type its name says' });
      text = await extractResumeText(file.path);
      if (!text) throw new HttpError(400, 'Please correct the highlighted fields', { resume: 'No text could be read from this file. Upload a Word file or a text-based PDF.' });
      check.cvText = text;
    }
    if (!text) throw new HttpError(400, 'Please correct the highlighted fields', { resume: 'Upload the CV again so it can be rewritten' });

    const job = check.job ? await Job.findById(check.job) : null;
    check.fix = { status: 'pending', ...body, startedAt: new Date() };
    await check.save();
    inBackground(finishFix(check._id, { text, ...body, job, targetRole: check.targetRole }));
    const { cvText: _omit, ...rest } = check.toObject();
    res.status(202).json({ check: { ...rest, hasCvText: true } });
  } finally {
    // Uploaded files are only read, never kept
    if (file) removeFile(file.path);
  }
});

// Ask a follow-up question about the report; the conversation is saved with the check
router.post('/:id/chat', aiChatLimiter, async (req, res) => {
  assertObjectId(req.params.id, 'CV check');
  const { message } = validate(z.object({ message: z.string().trim().min(1, 'Type a question').max(2000) }), req.body ?? {});
  if (!aiEnabled()) throw new HttpError(400, 'AI isn’t set up on this server, so chat is not available');
  const check = await CvCheck.findOne({ _id: req.params.id, createdBy: req.user._id }).select('+cvText');
  if (!check) throw new HttpError(404, 'CV check not found');
  const job = check.job ? await Job.findById(check.job) : null;
  const chat = await askAboutCv(check, { text: await savedCvText(check), job, message });
  res.json({ chat });
});

router.delete('/:id/chat', async (req, res) => {
  assertObjectId(req.params.id, 'CV check');
  const r = await CvCheck.updateOne({ _id: req.params.id, createdBy: req.user._id }, { $set: { chat: [] } });
  if (!r.matchedCount) throw new HttpError(404, 'CV check not found');
  res.json({ chat: [] });
});

// The rewritten CV as a Word file
router.get('/:id/fix.docx', async (req, res) => {
  assertObjectId(req.params.id, 'CV check');
  const check = await CvCheck.findOne({ _id: req.params.id, createdBy: req.user._id }).select('fix fileName').lean();
  if (check?.fix?.status !== 'done') throw new HttpError(404, 'No rewritten CV yet');
  const base = (check.fileName || 'CV').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'CV';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${base}-improved.docx"`);
  res.send(await cvToDocx(check.fix.result.improvedCv));
});

router.delete('/:id', async (req, res) => {
  assertObjectId(req.params.id, 'CV check');
  const r = await CvCheck.deleteOne({ _id: req.params.id, createdBy: req.user._id });
  if (!r.deletedCount) throw new HttpError(404, 'CV check not found');
  res.json({ ok: true });
});

export default router;
