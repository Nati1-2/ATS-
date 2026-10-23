// Job seekers: check a CV signed out, sign up to see the score, pay by Payoneer, and an admin unlocks the full report.
import { test, expect } from '@playwright/test';
import { seed, login, trackErrors, PASSWORD } from '../helpers.js';

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => seed());

const CV = `Hana Bekele
hana@example.com +251 911 000000
Experience
Backend Developer, Acme (Jan 2019 - Present)
Responsible for Node.js APIs and MongoDB. Built a billing service used by 2000 customers.
Education
BSc Computer Science, Addis Ababa University (2014 - 2018)
Skills
Node.js, MongoDB, Docker, AWS`;

test('check a CV → sign up → score only → pay → admin approves → full report', async ({ page, browser }) => {
  const errors = trackErrors(page);
  await page.goto('/careers');
  await page.getByRole('link', { name: 'Check your CV' }).click();
  await page.setInputFiles('#cv-file', { name: 'hana-cv.txt', mimeType: 'text/plain', buffer: Buffer.from(CV) });
  await page.getByRole('button', { name: 'Check my CV' }).click();

  await expect(page).toHaveURL(/\/my\/signup\?checked=1/);
  await expect(page.getByText('Your CV has been checked')).toBeVisible();
  await page.getByLabel('Full name').fill('Hana Bekele');
  await page.getByLabel('Email').fill('hana@example.com');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  // Dashboard: the score, but no report until the upgrade
  await expect(page).toHaveURL(/\/my$/);
  await expect(page.getByText('hana-cv.txt')).toBeVisible();
  await expect(page.getByText('Score only')).toBeVisible();
  await expect(page.getByRole('link', { name: 'View full report' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Improve my CV' }).click();
  await expect(page.getByText('natnaelsolomon571@gmail.com')).toBeVisible();
  await page.getByRole('button', { name: /I’ve paid/ }).click();
  await expect(page.getByText('Enter the transaction ID')).toBeVisible(); // required
  await page.getByLabel('Transaction ID').fill('PYN-778899');
  await page.getByRole('button', { name: /I’ve paid/ }).click();
  await expect(page.getByRole('heading', { name: 'Waiting for approval' })).toBeVisible();

  const admin = await (await browser.newContext()).newPage();
  await login(admin, 'admin@acme.test');
  await admin.getByRole('link', { name: /Payments/ }).click();
  await expect(admin.getByText('PYN-778899')).toBeVisible();
  await admin.getByRole('button', { name: 'Approve' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(admin.getByText('Nothing waiting')).toBeVisible();

  await page.goto('/my');
  await expect(page.getByText('Full reports unlocked')).toBeVisible();
  await page.getByRole('link', { name: 'View full report' }).click();
  await expect(page.getByText('ATS quick checks')).toBeVisible();
  expect(errors).toEqual([]);
});

test('jobs applied for while signed in show on the dashboard', async ({ page }) => {
  await page.goto('/my/login');
  await page.getByLabel('Email').fill('hana@example.com');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/my$/);
  await expect(page.getByText('No applications yet')).toBeVisible();

  const title = await page.evaluate(async () => {
    const { jobs } = await (await fetch('/api/public/jobs')).json();
    const { job } = await (await fetch(`/api/public/jobs/${jobs[0]._id}`)).json();
    const fd = new FormData();
    fd.append('fullName', 'Hana Bekele');
    fd.append('email', 'hana@example.com');
    fd.append('answers', JSON.stringify(Object.fromEntries(job.screeningQuestions.map((q) => [q._id, q.type === 'yes_no' ? 'yes' : q.type === 'number' ? '5' : 'Yes']))));
    fd.append('resume', new Blob(['Hana Bekele\nExperience\nBackend Developer (2019 - Present)\nNode.js'], { type: 'text/plain' }), 'cv.txt');
    await fetch(`/api/public/jobs/${job._id}/apply`, { method: 'POST', body: fd });
    return job.title;
  });
  await page.reload();
  await expect(page.getByRole('link', { name: title })).toBeVisible();
});

test('the dashboard needs a job seeker account; recruiters have no Payments page', async ({ page, browser }) => {
  await page.goto('/my');
  await expect(page).toHaveURL(/\/my\/login$/);
  const rec = await (await browser.newContext()).newPage();
  await login(rec);
  await expect(rec.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Payments/ })).toHaveCount(0);
});
