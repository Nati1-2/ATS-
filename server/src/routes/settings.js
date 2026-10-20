import { Router } from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { User, Invite, Job, ROLES, getCompany } from '../models/index.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError, validate, assertObjectId } from '../utils/http.js';
import { logoUpload, removeFile, UPLOAD_DIR } from '../utils/uploads.js';
import { publicCompany } from './public.js';
import { publicUser, hashToken } from './auth.js';

const router = Router();
const adminOnly = requireRole('admin');

// ---- Company profile ----
router.get('/company', async (_req, res) => res.json({ company: publicCompany(await getCompany()) }));

const optionalUrl = z.union([z.literal(''), z.string().trim().url('Enter a full URL, e.g. https://example.com')]);
const companySchema = z.object({
  name: z.string().trim().min(2, 'Company name is required').max(120),
  description: z.string().trim().max(3000).optional().default(''),
  website: optionalUrl.optional().default(''),
  contactEmail: z.union([z.literal(''), z.string().trim().email('Enter a valid email address')]).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  address: z.string().trim().max(300).optional().default(''),
  careersHeadline: z.string().trim().max(120).optional().default(''),
  careersIntro: z.string().trim().max(1500).optional().default(''),
  // Sent as one benefit per line (the form is multipart because of the logo upload)
  benefits: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.split('\n').map((b) => b.trim()).filter(Boolean).slice(0, 12).map((b) => b.slice(0, 160))),
  removeLogo: z.enum(['true', 'false']).optional(),
});

router.put('/company', adminOnly, logoUpload.single('logo'), async (req, res) => {
  try {
    const { removeLogo, ...data } = validate(companySchema, req.body ?? {});
    const company = await getCompany();
    const oldLogo = company.logo?.filename;
    company.set(data);
    if (req.file) company.logo = { filename: req.file.filename, mimetype: req.file.mimetype };
    else if (removeLogo === 'true') company.logo = undefined;
    await company.save();
    if (oldLogo && oldLogo !== company.logo?.filename) removeFile(path.join(UPLOAD_DIR, 'logos', oldLogo));
    res.json({ company: publicCompany(company) });
  } catch (err) {
    if (req.file) removeFile(req.file.path);
    throw err;
  }
});

// ---- Team (list is readable by all staff for interviewer / hiring-manager pickers) ----
router.get('/team', async (req, res) => {
  const users = await User.find({ active: true }).sort({ name: 1 });
  const invites =
    req.user.role === 'admin'
      ? await Invite.find({ acceptedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 })
      : [];
  res.json({
    users: users.map((u) => ({ ...publicUser(u), createdAt: u.createdAt })),
    invites: invites.map((i) => ({ id: i._id, email: i.email, role: i.role, expiresAt: i.expiresAt })),
  });
});

router.post('/team/invites', adminOnly, async (req, res) => {
  const data = validate(
    z.object({
      email: z.string().trim().toLowerCase().email('Enter a valid email address'),
      role: z.enum(ROLES, { errorMap: () => ({ message: 'Select a role' }) }),
    }),
    req.body
  );
  if (await User.exists({ email: data.email })) {
    throw new HttpError(409, 'Please correct the highlighted fields', { email: 'This person is already a team member' });
  }
  await Invite.deleteMany({ email: data.email, acceptedAt: null });
  const token = crypto.randomBytes(32).toString('hex');
  const invite = await Invite.create({
    ...data,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    invitedBy: req.user._id,
  });
  // No automated email in v1 — the admin copies and shares this link.
  const inviteUrl = `${process.env.CLIENT_URL}/accept-invite?token=${token}`;
  res.status(201).json({ invite: { id: invite._id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt }, inviteUrl });
});

router.delete('/team/invites/:id', adminOnly, async (req, res) => {
  assertObjectId(req.params.id, 'Invite');
  await Invite.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
});

async function loadMember(req) {
  assertObjectId(req.params.id, 'Team member');
  const user = await User.findOne({ _id: req.params.id, active: true });
  if (!user) throw new HttpError(404, 'Team member not found');
  if (user._id.equals(req.user._id)) throw new HttpError(400, 'You cannot change your own role or remove yourself');
  return user;
}

async function assertNotLastAdmin(user) {
  if (user.role === 'admin' && (await User.countDocuments({ role: 'admin', active: true })) <= 1) {
    throw new HttpError(400, 'There must be at least one admin');
  }
}

router.patch('/team/:id', adminOnly, async (req, res) => {
  const { role } = validate(z.object({ role: z.enum(ROLES) }), req.body);
  const user = await loadMember(req);
  if (role !== 'admin') await assertNotLastAdmin(user);
  if (user.role === 'hiring_manager' && role !== 'hiring_manager') {
    await Job.updateMany({}, { $pull: { hiringManagers: user._id } });
  }
  user.role = role;
  await user.save();
  res.json({ user: publicUser(user) });
});

router.delete('/team/:id', adminOnly, async (req, res) => {
  const user = await loadMember(req);
  await assertNotLastAdmin(user);
  // Deactivate rather than delete so authorship of notes and activity is preserved.
  user.active = false;
  user.email = `removed+${user._id}@${user.email.split('@')[1] ?? 'invalid'}`;
  await user.save();
  await Job.updateMany({}, { $pull: { hiringManagers: user._id } });
  res.json({ ok: true });
});

export default router;
