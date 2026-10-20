import jwt from 'jsonwebtoken';
import { User, Job } from '../models/index.js';
import { HttpError } from '../utils/http.js';

export const COOKIE_NAME = 'ats_token';

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Secure cookies need HTTPS; COOKIE_SECURE=false allows a plain-HTTP trial deployment
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export async function requireAuth(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) throw new HttpError(401, 'Authentication required');
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Session expired, please sign in again');
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.active) throw new HttpError(401, 'Account not found or disabled');
  req.user = user;
  next();
}

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.user.role)) throw new HttpError(403, 'You do not have permission to do this');
    next();
  };

/** Admins and recruiters see every job; hiring managers only the jobs they are assigned to. */
export async function accessibleJobIds(user) {
  if (user.role !== 'hiring_manager') return null;
  const jobs = await Job.find({ hiringManagers: user._id }).select('_id');
  return jobs.map((j) => j._id);
}

export async function assertJobAccess(user, jobId) {
  const ids = await accessibleJobIds(user);
  if (ids && !ids.some((id) => id.equals(jobId))) throw new HttpError(403, 'You are not assigned to this job');
}

export const canManageHiring = (user) => user.role === 'admin' || user.role === 'recruiter';
