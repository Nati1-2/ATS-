import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';

/**
 * Bootstrap the first admin from .env (ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME) on an empty install.
 * After that the database is the source of truth: once any active admin exists, .env is ignored and
 * existing accounts are never changed. Use `npm run create-admin` to recover a lost admin password.
 * Does nothing when ADMIN_EMAIL or ADMIN_PASSWORD is unset.
 */
export async function ensureEnvAdmin(env = process.env) {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  if (!email || !password) return null;

  if (await User.exists({ role: 'admin', active: true })) return null;
  if (await User.exists({ email })) return null;

  const user = await User.create({
    email,
    name: env.ADMIN_NAME?.trim() || 'Administrator',
    role: 'admin',
    passwordHash: await bcrypt.hash(password, 10),
  });
  console.log(`First admin account created from .env: ${email}`);
  return user;
}
