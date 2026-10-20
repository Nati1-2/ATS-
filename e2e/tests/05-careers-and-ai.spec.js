// Public careers home + AI reports and assistant (the suite runs with AI off: everything must still work)
import { test, expect } from '@playwright/test';
import { seed, login, trackErrors } from '../helpers.js';

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => seed());

test('careers home: headline, facts, benefits, roles grouped by team, footer', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/careers');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Build the software that keeps the world’s deliveries moving');
  await expect(page.getByText('Open roles', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What you can expect' })).toBeVisible();
  await expect(page.getByText('$2,000 yearly learning budget')).toBeVisible();
  const engineering = page.getByRole('heading', { level: 3, name: /^Engineering/ });
  await expect(engineering).toContainText('2');
  await expect(page.getByRole('heading', { level: 4, name: 'Senior Frontend Engineer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Equal opportunity' })).toBeVisible();

  await page.getByRole('heading', { level: 4, name: 'Senior Frontend Engineer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Senior Frontend Engineer' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Engineering');
  await page.getByRole('link', { name: 'Apply for this job' }).click();
  await expect(page.getByRole('heading', { name: 'Apply for this role' })).toBeInViewport();
  expect(errors).toEqual([]);
});

test('admin edits the careers page content in Settings', async ({ page }) => {
  await login(page, 'admin@acme.test');
  await page.goto('/settings');
  await page.getByLabel('Headline').fill('Come build with us');
  await page.getByLabel('Benefits').fill('Four-day week in summer\nFree lunch');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Company settings saved')).toBeVisible();
  await page.goto('/careers');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Come build with us');
  await expect(page.getByText('Four-day week in summer')).toBeVisible();
  await expect(page.getByText('$2,000 yearly learning budget')).toHaveCount(0);
});

test('reports: numbers and charts work without AI, with a table view', async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  await page.goto('/reports');
  await expect(page.getByText('No report selected')).toBeVisible();
  await page.getByRole('button', { name: /Generate report/ }).click();
  await expect(page.getByText('so it contains numbers and charts only')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'All jobs — hiring report' })).toBeVisible();
  const kpi = page.getByText('Applications', { exact: true }).first().locator('..');
  await expect(kpi).toContainText('17');
  const pipeline = page.locator('section, div').filter({ has: page.getByRole('heading', { name: 'Pipeline by stage' }) }).last();
  await pipeline.getByText('Show as table').click();
  await expect(pipeline.getByRole('row', { name: /Screening 6/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Waiting 7+ days in one stage' })).toBeVisible();

  // It is listed and opens again later
  await page.reload();
  await expect(page.getByRole('link', { name: /All jobs/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'All jobs — hiring report' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('job page links to a report for that job', async ({ page }) => {
  await login(page);
  await page.goto('/jobs');
  await page.getByRole('link', { name: 'Senior Frontend Engineer', exact: true }).click();
  await page.getByRole('link', { name: 'AI report', exact: true }).click();
  await expect(page.getByLabel('Report on')).toHaveValue(/[a-f0-9]{24}/);
  await page.getByRole('button', { name: /Generate report/ }).click();
  await expect(page.getByRole('heading', { name: 'Senior Frontend Engineer — hiring report' })).toBeVisible();
});

test('assistant explains when AI is not set up', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Ask AI' }).click();
  const panel = page.getByRole('dialog', { name: 'AI assistant' });
  await expect(panel).toContainText('isn’t set up on this server');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('sidebar AI section opens the full assistant page and AI reports', async ({ page }) => {
  await login(page);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('link', { name: 'AI assistant' }).click();
  await expect(page).toHaveURL(/\/assistant$/);
  await expect(page.getByRole('heading', { name: 'AI assistant', level: 1 })).toBeVisible();
  await expect(page.getByText('isn’t set up on this server')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask AI' })).toHaveCount(0); // no floating button on the full page
  await nav.getByRole('link', { name: 'AI reports' }).click();
  await expect(page.getByRole('heading', { name: 'AI reports', level: 1 })).toBeVisible();
});
