// CV checker from the sidebar and from a candidate profile. Runs with AI off: the quick checks must still work.
import { test, expect } from '@playwright/test';
import { seed, login, trackErrors, tab } from '../helpers.js';

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => seed());

const CV = `Experience
Web Developer, Acme (2021 - Present)
I was responsible for various pages and I worked on my team's website.
Education
BSc Computer Science
Skills
React, CSS`;

test('paste a CV: quick checks explain what to fix, and the report is saved to history', async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'CV checker' }).click();
  await expect(page.getByRole('heading', { name: 'CV checker', level: 1 })).toBeVisible();
  await expect(page.getByText('Your report will appear here')).toBeVisible();

  await page.getByRole('radio', { name: 'Paste text' }).click();
  await page.getByLabel('CV text').fill('too short');
  await page.getByRole('button', { name: 'Check CV' }).click();
  await expect(page.getByText('Paste the whole CV (at least 100 characters)')).toBeVisible();

  await page.getByLabel('CV text').fill(CV);
  await page.getByLabel('Compare with').selectOption({ label: 'Senior Frontend Engineer' });
  await page.getByRole('button', { name: 'Check CV' }).click();
  await expect(page).toHaveURL(/\/cv-checker\?id=[a-f0-9]{24}/);
  await expect(page.getByText('AI isn’t set up on this server')).toBeVisible();
  await expect(page.getByText('Target: Senior Frontend Engineer')).toBeVisible();
  await expect(page.getByText(/Weak phrases found: "responsible for"/)).toBeVisible();
  await expect(page.getByText(/No email address or phone number found/)).toBeVisible();
  await expect(page.getByText(/Required skills not found: TypeScript/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Pasted CV/ })).toBeVisible();

  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Your report will appear here')).toBeVisible();
  await expect(page.getByRole('link', { name: /Pasted CV/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('profile → "Check CV quality" checks the applicant’s CV against their job', async ({ page }) => {
  await login(page);
  await page.goto('/candidates?q=Daniel');
  await page.getByRole('link', { name: 'Daniel Okafor' }).first().click();
  await tab(page, 'Résumé');
  await page.getByRole('link', { name: 'Check CV quality' }).click();
  await expect(page.getByText('Checking this applicant’s CV on file.')).toBeVisible();
  await expect(page.getByLabel('Compare with')).toHaveValue(/[a-f0-9]{24}/);
  await page.getByRole('button', { name: 'Check CV' }).click();
  await expect(page.getByText('Target: Senior Frontend Engineer')).toBeVisible();
  await expect(page.getByText(/Daniel Okafor · Daniel_Okafor_Resume\.pdf/)).toBeVisible();
});
