import { Router } from 'express';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Application, Payment, Seeker, SeekerCheck } from '../models/index.js';
import { cookieOptions } from '../middleware/auth.js';
import { SEEKER_COOKIE, currentSeeker, requireSeeker, seekerIdFromCookie, setSeekerCookie } from '../middleware/seekerAuth.js';
import { accountLimiter, seekerCheckLimiter, seekerLoginLimiter } from '../middleware/rateLimits.js';
import { HttpError, validate, assertObjectId } from '../utils/http.js';
import { resumeUpload, verifyResumeSignature, removeFile } from '../utils/uploads.js';
import { extractResumeText } from '../utils/screening.js';
import { aiEnabled } from '../utils/ai.js';
import { quickChecks, reviewCv } from '../utils/cvChecker.js';
import { inBackground } from '../utils/aiQueue.js';
import { hashToken } from './auth.js';

/**
 * Job seekers: check your own CV, then sign up to see the score.
 * The full report (rewrites, fixes, keywords) unlocks once an admin approves a Payoneer payment.
 */
const router = Router();

// Checks made before signing up are claimed with this cookie when the person signs up or in
const CLAIM_COOKIE = 'seeker_claim';

export function paymentInfo(env = process.env) {
  return {
    method: 'Payoneer',
    payeeEmail: env.PAYONEER_EMAIL || 'natnaelsolomon571@gmail.com',
    amount: Number(env.CV_UPGRADE_PRICE) > 0 ? Number(env.CV_UPGRADE_PRICE) : 10,
    currency: env.CV_UPGRADE_CURRENCY || 'USD',
  };
}

const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(200);

const publicSeeker = (s) => ({ id: s._id, name: s.name, email: s.email, premium: Boolean(s.premiumAt) });

// A review still 'pending' after this long was cut short (for example by a restart): fall back to the quick checks
const STALE_REVIEW_MS = 5 * 60 * 1000;
const isPending = (c) => c.aiStatus === 'pending' && Date.now() - new Date(c.createdAt).getTime() < STALE_REVIEW_MS;
// No score while the AI review runs, so the number doesn't change under the person's eyes
const checkScore = (c) => (isPending(c) ? null : (c.review?.overallScore ?? c.quick?.score ?? 0));
// Until the upgrade is approved a seeker sees only the score
const checkSummary = (c, premium) => ({ _id: c._id, fileName: c.fileName, targetRole: c.targetRole, createdAt: c.createdAt, score: checkScore(c), pending: isPending(c), locked: !premium });

/**
 * Everything slow about a CV check, run after the upload has replied: read the text, run the
 * quick checks, save the result, then the AI review. The uploaded file is deleted at the end.
 */
async function processCheck(checkId, { file, seekerId, claimTokenHash, targetRole }) {
  try {
    const text = await extractResumeText(file.path);
    // A scanned PDF has no text: the AI reads the file itself
    const pdfPath = !text && path.extname(file.filename) === '.pdf' ? file.path : null;
    const runAi = aiEnabled() && Boolean(text || pdfPath);
    await SeekerCheck.create({
      _id: checkId,
      seeker: seekerId || undefined,
      claimTokenHash: claimTokenHash || undefined,
      fileName: file.originalname,
      targetRole: targetRole || undefined,
      quick: quickChecks(text),
      aiStatus: runAi ? 'pending' : 'disabled',
    });
    if (!runAi) return;
    try {
      const ai = await reviewCv({ text, pdfPath, targetRole });
      await SeekerCheck.updateOne({ _id: checkId }, { $set: { review: ai.review, aiStatus: ai.status, aiError: ai.error, model: ai.model } });
    } catch (err) {
      console.error(`[cv review] ${checkId}: ${err.message}`);
      await SeekerCheck.updateOne({ _id: checkId }, { $set: { aiStatus: 'failed', aiError: 'The AI review could not be completed' } });
    }
  } catch (err) {
    console.error(`[cv check] ${checkId}: ${err.message}`);
  } finally {
    // Uploaded files are only read, never kept
    removeFile(file.path);
  }
}

// Applicant-facing wording for pipeline stages
const APPLICATION_STATUS = { applied: 'Under review', screening: 'Under review', interview: 'Interview', offer: 'Offer', hired: 'Hired', rejected: 'Not selected' };

// The claim cookie stays until sign-out: a check saved a moment after sign-up is still claimed on the dashboard
async function claimChecks(req, seeker) {
  const token = req.cookies?.[CLAIM_COOKIE];
  if (!token) return;
  await SeekerCheck.updateMany({ claimTokenHash: hashToken(token), seeker: null }, { $set: { seeker: seeker._id }, $unset: { claimTokenHash: 1 } });
}

// Check a CV. Works signed out; the result is then held until the person signs up or in.
// Replies as soon as the file is known to be valid (no database round trip); see processCheck for the rest.
router.post('/check', seekerCheckLimiter, resumeUpload.single('resume'), async (req, res) => {
  const file = req.file;
  let handedOff = false;
  try {
    const body = validate(z.object({ targetRole: z.string().trim().max(200).optional().default('') }), req.body ?? {});
    if (!file) throw new HttpError(400, 'Please correct the highlighted fields', { resume: 'Choose your CV file' });
    if (!verifyResumeSignature(file.path)) throw new HttpError(400, 'Please correct the highlighted fields', { resume: 'This file is damaged or is not really the type its name says' });

    const seekerId = seekerIdFromCookie(req);
    const claimToken = seekerId ? null : req.cookies?.[CLAIM_COOKIE] || crypto.randomBytes(32).toString('hex');
    const id = new mongoose.Types.ObjectId();
    inBackground(processCheck(id, { file, seekerId, claimTokenHash: claimToken && hashToken(claimToken), targetRole: body.targetRole }));
    handedOff = true;
    if (claimToken) res.cookie(CLAIM_COOKIE, claimToken, cookieOptions(24 * 60 * 60 * 1000));
    res.status(201).json({ id, signedIn: Boolean(seekerId) });
  } finally {
    if (file && !handedOff) removeFile(file.path);
  }
});

router.post('/signup', accountLimiter, async (req, res) => {
  const body = validate(z.object({ name: z.string().trim().min(2, 'Enter your full name').max(100), email, password }), req.body);
  if (await Seeker.exists({ email: body.email })) throw new HttpError(409, 'An account with this email already exists. Sign in instead.', { email: 'Already registered' });
  const seeker = await Seeker.create({ name: body.name, email: body.email, passwordHash: await bcrypt.hash(body.password, 10) });
  await claimChecks(req, seeker);
  setSeekerCookie(res, seeker);
  res.status(201).json({ seeker: publicSeeker(seeker) });
});

router.post('/login', seekerLoginLimiter, async (req, res) => {
  const body = validate(z.object({ email, password: z.string().min(1, 'Password is required') }), req.body);
  const seeker = await Seeker.findOne({ email: body.email }).select('+passwordHash');
  if (!seeker || !(await bcrypt.compare(body.password, seeker.passwordHash))) throw new HttpError(401, 'Incorrect email or password');
  await claimChecks(req, seeker);
  setSeekerCookie(res, seeker);
  res.json({ seeker: publicSeeker(seeker) });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(SEEKER_COOKIE, { path: '/' });
  res.clearCookie(CLAIM_COOKIE, { path: '/' });
  res.json({ ok: true });
});

// Signed out is a normal answer here (the public header asks on every page), not an error
router.get('/me', async (req, res) => {
  const seeker = await currentSeeker(req);
  res.json({ seeker: seeker ? publicSeeker(seeker) : null });
});

router.use(requireSeeker);

router.get('/checks', async (req, res) => {
  await claimChecks(req, req.seeker);
  const checks = await SeekerCheck.find({ seeker: req.seeker._id }).select('fileName targetRole createdAt aiStatus quick.score review.overallScore').sort({ createdAt: -1 }).limit(50).lean();
  res.json({ checks: checks.map((c) => checkSummary(c, Boolean(req.seeker.premiumAt))) });
});

router.get('/checks/:id', async (req, res) => {
  assertObjectId(req.params.id, 'CV check');
  const check = await SeekerCheck.findOne({ _id: req.params.id, seeker: req.seeker._id }).lean();
  if (!check) throw new HttpError(404, 'CV check not found');
  const premium = Boolean(req.seeker.premiumAt);
  if (!premium || isPending(check)) return res.json({ check: checkSummary(check, premium) });
  // A review cut short shows as failed, with the quick checks still there
  const aiStatus = check.aiStatus === 'pending' ? 'failed' : check.aiStatus;
  res.json({ check: { ...check, aiStatus, aiError: aiStatus === 'failed' ? check.aiError || 'The AI review could not be completed' : undefined, score: checkScore(check), pending: false, locked: false } });
});

router.get('/applications', async (req, res) => {
  const apps = await Application.find({ seeker: req.seeker._id }).populate('job', 'title department location').select('job stage createdAt').sort({ createdAt: -1 }).lean();
  res.json({
    applications: apps.map((a) => ({ _id: a._id, job: a.job, appliedAt: a.createdAt, status: APPLICATION_STATUS[a.stage] })),
  });
});

router.get('/payment', async (req, res) => {
  const payment = await Payment.findOne({ seeker: req.seeker._id }).select('status amount currency reference rejectReason createdAt reviewedAt').sort({ createdAt: -1 }).lean();
  res.json({ ...paymentInfo(), premium: Boolean(req.seeker.premiumAt), payment });
});

router.post('/payment', accountLimiter, async (req, res) => {
  const body = validate(
    z.object({
      payerName: z.string().trim().min(2, 'Enter the name on your Payoneer account').max(120),
      payerEmail: email,
      reference: z.string().trim().min(3, 'Enter the transaction ID from your Payoneer receipt').max(120),
      note: z.string().trim().max(1000).optional().default(''),
    }),
    req.body
  );
  if (req.seeker.premiumAt) throw new HttpError(409, 'Your account is already upgraded');
  if (await Payment.exists({ seeker: req.seeker._id, status: 'pending' })) throw new HttpError(409, 'Your payment is already waiting for approval');
  const { amount, currency } = paymentInfo();
  const payment = await Payment.create({ seeker: req.seeker._id, ...body, amount, currency });
  res.status(201).json({ payment });
});

export default router;
