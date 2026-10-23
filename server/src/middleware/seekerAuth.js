import jwt from 'jsonwebtoken';
import { Seeker } from '../models/index.js';
import { HttpError } from '../utils/http.js';
import { cookieOptions } from './auth.js';

// Job seeker sessions use their own cookie and token audience, so they never count as a staff session
export const SEEKER_COOKIE = 'seeker_token';
const AUDIENCE = 'seeker';

export function setSeekerCookie(res, seeker) {
  const token = jwt.sign({ sub: seeker._id.toString() }, process.env.JWT_SECRET, { expiresIn: '30d', audience: AUDIENCE });
  res.cookie(SEEKER_COOKIE, token, cookieOptions(30 * 24 * 60 * 60 * 1000));
}

/** The signed-in job seeker's id from the cookie alone (no database lookup), or null. */
export function seekerIdFromCookie(req) {
  const token = req.cookies?.[SEEKER_COOKIE];
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET, { audience: AUDIENCE }).sub;
  } catch {
    return null;
  }
}

/** The signed-in job seeker, or null. */
export async function currentSeeker(req) {
  const token = req.cookies?.[SEEKER_COOKIE];
  if (!token) return null;
  try {
    const { sub } = jwt.verify(token, process.env.JWT_SECRET, { audience: AUDIENCE });
    return await Seeker.findById(sub);
  } catch {
    return null;
  }
}

export async function requireSeeker(req, _res, next) {
  const seeker = await currentSeeker(req);
  if (!seeker) throw new HttpError(401, 'Please sign in to continue');
  req.seeker = seeker;
  next();
}
