/*
 * Create (or reset) an admin account on a fresh deployment, without demo data.
 *   npm run create-admin -- --email you@company.com --name "Your Name"
 * The password is read from ADMIN_PASSWORD, or a strong one is generated and printed once.
 */
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../../../.env') });
loadEnv();
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, getCompany } from '../models/index.js';

const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' }, company: { type: 'string' } } });
const email = values.email?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: npm run create-admin -- --email you@company.com --name "Your Name" [--company "Company name"]');
  process.exit(1);
}
const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
if (password.length < 8) {
  console.error('ADMIN_PASSWORD must be at least 8 characters');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);
const passwordHash = await bcrypt.hash(password, 10);
const existing = await User.findOne({ email });
if (existing) {
  existing.set({ role: 'admin', active: true, passwordHash, ...(values.name ? { name: values.name } : {}) });
  await existing.save();
  console.log(`Updated ${email}: now an active admin with a new password.`);
} else {
  await User.create({ email, name: values.name || email.split('@')[0], role: 'admin', passwordHash });
  console.log(`Created admin ${email}.`);
}
if (values.company) {
  const company = await getCompany();
  company.name = values.company;
  await company.save();
}
if (!process.env.ADMIN_PASSWORD) console.log(`Password: ${password}\n(Shown once — sign in and keep it safe.)`);
await mongoose.disconnect();
