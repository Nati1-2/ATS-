import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User, Invite } from '../models/index.js';
import { requireAuth, signToken, setAuthCookie, COOKIE_NAME } from '../middleware/auth.js';
import { loginLimiter, accountLimiter } from '../middleware/rateLimits.js';
import { HttpError, validate } from '../utils/http.js';

const router = Router();

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const email = z.string().trim().toLowerCase().email('Enter a valid email address');

export const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role });

router.post('/login', loginLimiter, async (req, res) => {
  const body = validate(z.object({ email, password: z.string().min(1, 'Password is required') }), req.body);
  const user = await User.findOne({ email: body.email }).select('+passwordHash');
  if (!user || !user.active || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw new HttpError(401, 'Incorrect email or password');
  }
  setAuthCookie(res, signToken(user));
  res.json({ user: publicUser(user) });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

router.post('/forgot-password', accountLimiter, async (req, res) => {
  const body = validate(z.object({ email }), req.body);
  const user = await User.findOne({ email: body.email, active: true });
  const response = { ok: true, message: 'If an account exists for that email, a reset link has been generated.' };
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = hashToken(token);
    user.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    const url = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
    // Automated emails are out of scope for v1: the link is logged and, in development, returned.
    console.log(`[password reset] ${user.email}: ${url}`);
    if (process.env.NODE_ENV !== 'production') response.devResetUrl = url;
  }
  res.json(response);
});

router.post('/reset-password', accountLimiter, async (req, res) => {
  const body = validate(z.object({ token: z.string().min(1), password }), req.body);
  const user = await User.findOne({
    resetTokenHash: hashToken(body.token),
    resetTokenExpires: { $gt: new Date() },
  });
  if (!user) throw new HttpError(400, 'This reset link is invalid or has expired');
  user.passwordHash = await bcrypt.hash(body.password, 10);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  await user.save();
  res.json({ ok: true });
});

async function findInvite(token) {
  const invite = await Invite.findOne({ tokenHash: hashToken(token), acceptedAt: null, expiresAt: { $gt: new Date() } });
  if (!invite) throw new HttpError(404, 'This invitation is invalid or has expired');
  return invite;
}

router.get('/invite/:token', async (req, res) => {
  const invite = await findInvite(req.params.token);
  res.json({ email: invite.email, role: invite.role });
});

router.post('/accept-invite', accountLimiter, async (req, res) => {
  const body = validate(
    z.object({ token: z.string().min(1), name: z.string().trim().min(2, 'Enter your full name').max(100), password }),
    req.body
  );
  const invite = await findInvite(body.token);
  if (await User.exists({ email: invite.email })) throw new HttpError(409, 'An account with this email already exists');
  const user = await User.create({
    name: body.name,
    email: invite.email,
    role: invite.role,
    passwordHash: await bcrypt.hash(body.password, 10),
  });
  invite.acceptedAt = new Date();
  await invite.save();
  setAuthCookie(res, signToken(user));
  res.status(201).json({ user: publicUser(user) });
});

export { hashToken };
export default router;
