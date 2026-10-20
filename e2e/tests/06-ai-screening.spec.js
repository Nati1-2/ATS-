// AI screening: sidebar badge, the review queue, confirm / overturn, and the job settings.
// Uses the demo AI analyses from the seed, so it works with AI off.
import { test, expect } from '@playwright/test';
import { seed, login, trackErrors, tab } from '../helpers.js';

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => seed());

test('sidebar shows waiting AI decisions; recruiter overturns and confirms them', async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  const nav = page.getByRole('navigation', { name: 'Main' });
  const link = nav.getByRole('link', { name: /^AI screening/ });
  await expect(link).toContainText('1');
  await link.click();
  await expect(page.getByRole('heading', { name: 'AI screening', level: 1 })).toBeVisible();

  // Recommend mode: Daniel waits for a recruiter
  const daniel = page.getByRole('listitem').filter({ hasText: 'Daniel Okafor' });
  await expect(daniel).toContainText('AI fit 42% is below the 50% minimum');
  await daniel.getByRole('button', { name: 'Keep in Applied' }).click();
  await expect(page.getByText('All clear')).toBeVisible();
  await expect(link).not.toContainText('1');

  // Automatic mode: Amara was rejected by the AI; reinstate her
  await tab(page, 'Rejected by AI');
  const amara = page.getByRole('listitem').filter({ hasText: 'Amara Nwosu' });
  await expect(amara).toContainText('AI found no evidence of must-have skills: Figma, Prototyping, User research');
  await amara.getByRole('button', { name: 'Reinstate' }).click();
  await expect(page.getByText('All clear')).toBeVisible();

  // Strong fit was shortlisted; confirm it in bulk
  await tab(page, 'Shortlisted by AI');
  await page.getByLabel('Select Grace Miller').check();
  await page.getByRole('button', { name: 'Confirm shortlist (1)' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm shortlist' }).click();
  await expect(page.getByText('All clear')).toBeVisible();

  await tab(page, 'Reviewed');
  await expect(page.getByRole('listitem').filter({ hasText: 'Amara Nwosu' })).toContainText('Overturned');
  await expect(page.getByText('Rejections overturned').locator('..')).toContainText('100%');
  expect(errors).toEqual([]);
});

test('job form: AI screening mode and thresholds are validated and saved', async ({ page }) => {
  await login(page);
  await page.goto('/jobs');
  await page.getByRole('link', { name: 'Backend Engineer (Node.js)' }).first().click();
  await expect(page.getByRole('heading', { name: 'AI screening' })).toBeVisible();
  await page.getByRole('link', { name: /Edit/ }).click();
  await page.getByRole('radio', { name: /Automatic/ }).check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Set at least one AI rule, or turn AI screening off')).toBeVisible();
  await page.getByLabel('Reject if AI fit is below').fill('35');
  await page.getByLabel('Shortlist (move to Screening) if AI fit is at least').fill('80');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Reject if AI fit is below 35%')).toBeVisible();
  await expect(page.getByText('Shortlist if AI fit ≥ 80% and knockouts pass')).toBeVisible();
});
