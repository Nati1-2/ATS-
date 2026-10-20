import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { expect } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Reset the database to the demo data (refuses to run in production — see server/src/seed.js). */
export function seed() {
  execSync('npm run seed --silent', { cwd: path.join(ROOT, 'server'), stdio: 'pipe' });
}

export const PASSWORD = 'Password123!';

export async function login(page, email = 'recruiter@acme.test') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Collect uncaught page errors so every test can assert there were none. */
export function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export const tab = (page, name) => page.getByRole('tab', { name: new RegExp(`^${name}`) }).click();

export async function apiJson(page, url) {
  return page.evaluate(async (u) => (await fetch(u)).json(), url);
}
