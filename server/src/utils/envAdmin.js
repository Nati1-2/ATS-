import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';

/**
 * Keep the admin account named in .env (ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME) able to sign in:
 * created on first start, and re-activated / re-promoted / given the .env password if it drifted.
 * Does nothing when ADMIN_EMAIL or ADMIN_PASSWORD is unset.
 */
export async function ensureEnvAdmin(env = process.env) {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  if (!email || !password) return null;

  const existing = await User.findOne({ email }).select('+passwordHash');
  if (!existing) {
    const user = await User.create({
      email,
      name: env.ADMIN_NAME?.trim() || 'Administrator',
      role: 'admin',
      passwordHash: await bcrypt.hash(password, 10),
    });
    console.log(`Admin account created from .env: ${email}`);
    return user;
  }

  const passwordMatches = await bcrypt.compare(password, existing.passwordHash);
  if (existing.role !== 'admin' || !existing.active || !passwordMatches) {
    existing.set({ role: 'admin', active: true });
    if (!passwordMatches) existing.passwordHash = await bcrypt.hash(password, 10);
    await existing.save();
    console.log(`Admin account synced from .env: ${email}`);
  }
  return existing;
}
