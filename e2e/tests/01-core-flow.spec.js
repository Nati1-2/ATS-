// The flow from the original brief: create a job → publish → apply → review → move through the pipeline
import { test, expect } from '@playwright/test';
import { seed, login, trackErrors, tab, apiJson } from '../helpers.js';
import { strongCloudCv } from '../cvs.js';

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => seed());

let jobId;

test('login validates input and lands on the dashboard', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/); // protected page redirects
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Enter a valid email address')).toBeVisible();
  await login(page);
  await expect(page.getByRole('heading', { name: 'Recent applications' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('recruiter creates and publishes a job', async ({ page }) => {
  await login(page);
  await page.goto('/jobs/new');
  await page.getByRole('button', { name: 'Publish job' }).click();
  await expect(page.getByText('Title must be at least 3 characters')).toBeVisible();
  await page.getByLabel('Job title').fill('Site Reliability Engineer');
  await page.getByLabel('Department').fill('Engineering');
  await page.getByLabel(/^Location/).fill('Remote — EU');
  await page.getByLabel('Remote policy').selectOption('remote');
  await page.getByLabel('Employment type').selectOption('full_time');
  await page.getByLabel('About the role').fill('Keep our platform fast and reliable for thousands of fleets worldwide.');
  await page.getByLabel('Salary minimum').fill('90000');
  await page.getByLabel('Salary maximum').fill('120000');
  await page.getByLabel('Currency').fill('EUR');
  await page.getByLabel('Morgan Manager').check();
  await page.getByRole('button', { name: 'Publish job' }).click();
  await expect(page).toHaveURL(/\/jobs\/[a-f0-9]{24}$/);
  jobId = page.url().split('/').pop();
  await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();

  await page.goto('/jobs');
  await expect(page.getByRole('link', { name: 'Site Reliability Engineer', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Draft' }).click();
  await expect(page.getByRole('link', { name: 'Data Analyst', exact: true })).toBeVisible();
});

test('applicant finds the job on the careers site and applies with a CV', async ({ page }) => {
  const cv = await strongCloudCv();
  await page.goto('/careers');
  await expect(page.getByRole('heading', { name: 'Site Reliability Engineer' })).toBeVisible();
  await page.getByLabel('Filter by department').selectOption('Design');
  await expect(page.getByRole('heading', { name: 'Product Designer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Site Reliability Engineer' })).toHaveCount(0);

  await page.goto(`/careers/${jobId}`);
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByText('A résumé is required')).toBeVisible();
  await page.getByLabel('Full name').fill('Abebe Kebede');
  await page.getByLabel('Email').fill('abebe.flow@example.com');
  await page.getByLabel('Phone').fill('+251 911 000 111');
  await page.locator('#apply-resume').setInputFiles(cv);
  await page.getByLabel('Cover letter').fill('I love keeping systems up.');
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByText('Application submitted!')).toBeVisible();
});

test('closed jobs do not accept applications', async ({ page }) => {
  await login(page);
  const { jobs } = await apiJson(page, '/api/jobs?status=closed');
  await page.goto(`/careers/${jobs[0]._id}`);
  await expect(page.getByText('Applications closed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit application' })).toHaveCount(0);
});

test('recruiter reviews the candidate: résumé, note, stage, interview', async ({ page }) => {
  await login(page);
  await page.goto('/candidates');
  await page.getByLabel('Search by name or email').fill('abebe.flow');
  await page.getByRole('link', { name: 'Abebe Kebede' }).first().click();
  await expect(page.getByRole('heading', { name: 'Abebe Kebede' })).toBeVisible();

  await tab(page, 'Résumé');
  await expect(page.getByRole('link', { name: 'Download' })).toBeVisible();
  await expect(page.getByText('I love keeping systems up.')).toBeVisible();

  await tab(page, 'Notes');
  await page.getByLabel('Note', { exact: true }).fill('Strong infra background.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText('Strong infra background.')).toBeVisible();

  await page.getByLabel('Stage').selectOption('screening');
  await tab(page, 'Activity');
  await expect(page.getByText('Moved from Applied to Screening')).toBeVisible();

  await tab(page, 'Interviews');
  await page.getByRole('button', { name: 'Schedule' }).click();
  await page.getByRole('dialog', { name: /Schedule interview/ }).getByRole('textbox', { name: 'Date', exact: true }).fill(new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10));
  await page.getByLabel('Interviewer').selectOption({ label: 'Morgan Manager (Hiring manager)' });
  await page.getByRole('dialog').getByRole('button', { name: 'Schedule' }).click();
  await expect(page.getByText('with Morgan Manager').first()).toBeVisible();
  await tab(page, 'Activity');
  await expect(page.getByText('Scheduled an interview with Morgan Manager')).toBeVisible();
});

test('pipeline: drag and drop, keyboard move, saved after reload', async ({ page }) => {
  await login(page);
  await page.goto(`/pipeline?job=${jobId}`);
  const card = page.locator('li[draggable="true"]', { hasText: 'Abebe Kebede' });
  await card.dragTo(page.getByRole('region', { name: 'Interview column' }));
  await expect(page.getByRole('region', { name: 'Interview column' }).getByText('Abebe Kebede')).toBeVisible();

  await page.getByRole('button', { name: 'Move Abebe Kebede to another stage' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown'); // Applied → Screening
  await page.keyboard.press('ArrowDown'); // → Offer
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Offer column' }).getByText('Abebe Kebede')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Offer column' }).getByText('Abebe Kebede')).toBeVisible();
});

test('permissions: recruiter settings are read-only, admin can invite and remove', async ({ page, browser }) => {
  await login(page);
  await page.goto('/settings');
  await expect(page.getByText('Only admins can change company settings.')).toBeVisible();

  const admin = await (await browser.newContext()).newPage();
  await login(admin, 'admin@acme.test');
  await admin.goto('/settings');
  // Settings has two email fields (create account, invite by link): use the invite one
  await admin.locator('form', { hasText: 'Or invite by link' }).getByLabel('Email').fill('newperson@acme.test');
  await admin.getByRole('button', { name: 'Invite' }).click();
  await expect(admin.getByLabel('Invitation link')).toHaveValue(/accept-invite\?token=/);
  await admin.getByRole('button', { name: 'Remove Jordan Lee' }).click();
  await expect(admin.getByRole('dialog').getByText('will immediately lose access')).toBeVisible();
  await admin.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
});

test('hiring manager sees a read-only pipeline', async ({ page }) => {
  await login(page, 'manager@acme.test');
  await page.goto(`/pipeline?job=${jobId}`);
  await expect(page.getByText('Only recruiters can move candidates')).toBeVisible();
  await expect(page.locator('li[draggable="true"]')).toHaveCount(0);
});
