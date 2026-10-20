// Interface details: branding, global search, tabs, filters, mobile navigation and layout
import { test, expect } from '@playwright/test';
import { seed, login, trackErrors, apiJson } from '../helpers.js';

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => seed());

test('branding comes from company settings', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText('Acme Labs Hiring')).toBeVisible();
  await login(page);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByText('Acme Labs')).toBeVisible();
});

test('sign-in: show/hide password, demo account shortcut, redirect message', async ({ page }) => {
  await page.goto('/candidates');
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(page.getByText('Please sign in to continue.')).toBeVisible();
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('secret-value');
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByLabel('Work email').fill('recruiter@acme.test');
  await password.fill('Password123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/candidates$/); // back to where they were going
});

test('Ctrl+K search finds people and jobs; Enter opens; Escape closes', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('button', { name: /Search candidates and jobs/ })).toBeVisible(); // app ready
  await page.keyboard.press('Control+k');
  const box = page.getByRole('combobox', { name: 'Search candidates and jobs' });
  await box.fill('liya');
  await expect(page.getByRole('option', { name: /Liya Tesfaye/ }).first()).toBeVisible();
  await box.press('Enter');
  await expect(page.getByRole('heading', { name: 'Liya Tesfaye' })).toBeVisible();

  await page.getByRole('button', { name: /Search candidates and jobs/ }).click();
  await box.fill('designer');
  await expect(page.getByRole('group', { name: 'Jobs' }).getByText('Product Designer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(box).toBeHidden();
});

test('profile tabs work with the keyboard', async ({ page }) => {
  await login(page);
  const { applications } = await apiJson(page, '/api/candidates?q=liya');
  await page.goto(`/candidates/${applications[0].candidate._id}`);
  await page.getByRole('tab', { name: /^Overview/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tabpanel').getByRole('heading', { name: 'Résumé' })).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('tabpanel').getByRole('heading', { name: 'Activity timeline' })).toBeVisible();
});

test('filters: quick changes all stick, chips remove one or all', async ({ page }) => {
  await login(page);
  await page.goto('/candidates');
  await page.getByRole('button', { name: /CV filters/ }).click();
  await page.getByLabel('Minimum CV match').selectOption('75');
  await page.getByLabel('Filter by stage').selectOption('interview'); // immediately after — must not drop the first
  await expect(page.getByRole('button', { name: 'Remove filter: Match ≥ 75%' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove filter: Stage: Interview' })).toBeVisible();
  await expect(page).toHaveURL(/minScore=75/);
  await expect(page).toHaveURL(/stage=interview/);
  await page.getByRole('button', { name: 'Remove filter: Stage: Interview' }).click();
  await expect(page).not.toHaveURL(/stage=/);
  await expect(page).toHaveURL(/minScore=75/);
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page).toHaveURL(/\/candidates$/);
});

test('clicking a result right after typing does not bounce back to the list', async ({ page }) => {
  await login(page);
  await page.goto('/candidates');
  await page.getByLabel('Search by name or email').fill('liya');
  await page.getByRole('link', { name: 'Liya Tesfaye' }).first().click(); // within the 300 ms debounce
  await expect(page).toHaveURL(/\/candidates\/[a-f0-9]{24}/);
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(/\/candidates\/[a-f0-9]{24}/);
});

test.describe('phone (390 px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('menu drawer opens, navigates and closes', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('dialog', { name: 'Navigation' }).getByRole('link', { name: 'Pipeline' }).click();
    await expect(page).toHaveURL(/pipeline/);
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toHaveCount(0);
  });

  test('no page scrolls sideways', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackErrors(page);
    await login(page, 'admin@acme.test');
    const { jobs } = await apiJson(page, '/api/jobs');
    const { applications } = await apiJson(page, '/api/candidates?limit=3');
    const published = jobs.find((j) => j.status === 'published');
    const urls = [
      '/dashboard', '/jobs', '/jobs/new', `/jobs/${jobs[0]._id}`, `/jobs/${jobs[0]._id}/edit`, '/candidates',
      `/candidates/${applications[0].candidate._id}`, ...jobs.map((j) => `/pipeline?job=${j._id}`), '/settings',
      '/reports', '/assistant', '/careers', `/careers/${published._id}`,
    ];
    const tooWide = [];
    for (const url of urls) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      if (width > 390) tooWide.push(`${url} (${width}px)`);
    }
    expect(tooWide).toEqual([]);
    expect(errors).toEqual([]);
  });
});
