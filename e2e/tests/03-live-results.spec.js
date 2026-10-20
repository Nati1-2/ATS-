// Recruiters see a popup with the screening result when a new CV arrives (checked every 15 s)
import { test, expect } from '@playwright/test';
import { seed, login, trackErrors, apiJson } from '../helpers.js';
import { strongFrontendCv, weakCloudCv } from '../cvs.js';

test.beforeAll(() => seed());

test('new CVs pop up with score, decision and reason; dashboard refreshes itself', async ({ page, request }) => {
  test.setTimeout(150_000);
  const errors = trackErrors(page);
  await login(page);
  await expect(page.getByRole('button', { name: 'CV results', exact: true })).toBeVisible(); // nothing unread yet
  const totalBefore = await page.getByText('Total applications').locator('xpath=following-sibling::p').innerText();

  // Two people apply while the recruiter is looking at the dashboard
  const { jobs } = await apiJson(page, '/api/public/jobs?q=Senior%20Frontend');
  const job = jobs[0]._id;
  const { job: details } = await apiJson(page, `/api/public/jobs/${job}`);
  const answers = JSON.stringify({ [details.screeningQuestions[0]._id]: 'yes', [details.screeningQuestions[1]._id]: '6' });
  const fs = await import('node:fs');
  for (const [name, email, file] of [
    ['Hanna Bekele', 'hanna.b@example.com', await strongFrontendCv()],
    ['Abel Tadesse', 'abel.t@example.com', weakCloudCv()],
  ]) {
    const res = await request.post(`/api/public/jobs/${job}/apply`, {
      multipart: { fullName: name, email, answers, resume: { name: file.split('/').pop(), mimeType: 'application/octet-stream', buffer: fs.readFileSync(file) } },
    });
    expect(res.status()).toBe(201);
  }

  const popups = page.getByRole('status').filter({ hasText: 'New CV received' });
  await expect(popups.filter({ hasText: 'Hanna Bekele' })).toContainText('Auto-shortlisted', { timeout: 40_000 });
  await expect(popups.filter({ hasText: 'Abel Tadesse' })).toContainText('below the 40% minimum');
  await expect(page.getByText('Total applications').locator('xpath=following-sibling::p')).toHaveText(String(Number(totalBefore) + 2));

  await page.getByRole('button', { name: 'CV results, 2 new' }).click();
  await expect(page.getByText('New CV results')).toBeVisible();
  await expect(page.getByRole('button', { name: 'CV results', exact: true })).toBeVisible(); // badge cleared
  await page.locator('ul a', { hasText: 'Hanna Bekele' }).first().click();
  await expect(page.getByText('Automatically shortlisted to Screening when they applied')).toBeVisible();
  expect(errors).toEqual([]);
});
