// Automatic accept / reject / review from the CV, match report, and the file formats real ATSs accept
import { test, expect } from '@playwright/test';
import { seed, login, trackErrors, tab, apiJson } from '../helpers.js';
import { strongCloudCv, weakCloudCv, blankPdf, pdf, docx, txt, rtf, frontendLines } from '../cvs.js';

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => seed());

let jobId;

test('job with rules: validation and a readable summary of the rules', async ({ page }) => {
  await login(page);
  await page.goto('/jobs/new');
  await page.getByLabel('Job title').fill('Cloud Engineer');
  await page.getByLabel('Department').fill('Engineering');
  await page.getByLabel(/^Location/).fill('Remote');
  await page.getByLabel('Remote policy').selectOption('remote');
  await page.getByLabel('Employment type').selectOption('full_time');
  await page.getByLabel('About the role').fill('Run and scale our cloud platform across regions.');
  const must = page.getByLabel('Must-have skills');
  for (const s of ['Kubernetes', 'Terraform', 'AWS']) {
    await must.fill(s);
    await must.press('Enter');
  }
  await page.getByRole('button', { name: /\+ Are you legally authorized/ }).click();
  await page.getByLabel('Automatically reject applicants who fail a knockout question').check();

  await page.getByLabel('Reject if CV match is below').fill('80');
  await page.getByLabel('Shortlist (move to Screening) if CV match is at least').fill('50');
  await page.getByRole('button', { name: 'Publish job' }).click();
  await expect(page.getByText('Must be higher than the reject score')).toBeVisible();
  await page.getByLabel('Reject if CV match is below').fill('50');
  await page.getByLabel('Shortlist (move to Screening) if CV match is at least').fill('80');
  await expect(page.getByText('Must be higher than the reject score')).toHaveCount(0); // error clears once fixed
  await expect(page.getByText('fail a knockout question, or match below 50%')).toBeVisible();
  await page.getByRole('button', { name: 'Publish job' }).click();
  await expect(page).toHaveURL(/\/jobs\/[a-f0-9]{24}$/);
  jobId = page.url().split('/').pop();
  await expect(page.getByText(/Shortlist/).first()).toBeVisible();
});

async function apply(page, name, email, answer, file) {
  await page.goto(`/careers/${jobId}`);
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('radiogroup').getByText(answer).click();
  await page.locator('#apply-resume').setInputFiles(file);
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByText('Application submitted!')).toBeVisible(); // same message whatever happens next
}

test('three applicants: accepted, rejected, needs review', async ({ page, browser }) => {
  await apply(page, 'Selam Girma', 'selam@example.com', 'Yes', await strongCloudCv());
  await apply(page, 'Abel Tadesse', 'abel@example.com', 'Yes', weakCloudCv());
  await apply(page, 'Mekdes Haile', 'mekdes@example.com', 'Yes', blankPdf('scanned.pdf'));

  const rec = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = trackErrors(rec);
  await login(rec);
  await rec.goto(`/candidates?job=${jobId}&sort=score`);
  const row = (name) => rec.locator('tbody tr', { hasText: name });
  await expect(row('Selam Girma')).toContainText('Auto-shortlisted');
  await expect(row('Selam Girma')).toContainText('Screening');
  await expect(row('Abel Tadesse')).toContainText('Auto-rejected');
  await expect(row('Abel Tadesse')).toContainText('Rejected');
  await expect(row('Mekdes Haile')).toContainText('Applied');

  await rec.getByRole('link', { name: 'Abel Tadesse' }).click();
  await expect(rec.getByText('Automatically rejected when they applied')).toBeVisible();
  await expect(rec.getByText(/CV match \d+% is below the 50% minimum/).first()).toBeVisible();
  await rec.getByLabel('Stage').selectOption('screening'); // a person can always override
  await tab(rec, 'Activity');
  await expect(rec.getByText('Moved from Rejected to Screening')).toBeVisible();

  await rec.goto('/candidates?q=mekdes@');
  await rec.getByRole('link', { name: 'Mekdes Haile' }).first().click();
  await expect(rec.getByText('Needs manual review', { exact: true })).toBeVisible();
  await expect(rec.getByText('CV text could not be read').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('match report explains the score', async ({ page }) => {
  await login(page);
  const { applications } = await apiJson(page, '/api/candidates?q=liya');
  const fe = applications.find((a) => a.job.title === 'Senior Frontend Engineer');
  await page.goto(`/candidates/${fe.candidate._id}?application=${fe._id}`);
  for (const part of ['Must-have skills', 'Nice-to-have skills', 'Experience', 'Job title match', 'Education']) {
    await expect(page.getByRole('tabpanel').getByText(new RegExp(`^${part} · weight`))).toBeVisible();
  }
  await expect(page.getByText('Used in work experience').first()).toBeVisible();
  await expect(page.getByText('9.5 years (needs 5+)')).toBeVisible();
});

test('CV formats: PDF, DOCX, TXT and RTF are read and scored the same; fakes are refused', async ({ page }) => {
  await login(page);
  const { jobs } = await apiJson(page, '/api/public/jobs?q=Senior%20Frontend');
  const job = jobs[0]._id;
  const files = { pdf: pdf('meron.pdf', frontendLines), docx: await docx('meron.docx', frontendLines), txt: txt('meron.txt', frontendLines), rtf: rtf('meron.rtf', frontendLines) };

  for (const [ext, file] of Object.entries(files)) {
    await page.goto(`/careers/${job}`);
    await page.getByLabel('Full name').fill(`Meron ${ext.toUpperCase()}`);
    await page.getByLabel('Email').fill(`meron.${ext}@example.com`);
    await page.getByRole('radiogroup').getByText('Yes').click();
    await page.getByLabel(/How many years/).fill('6');
    await page.locator('#apply-resume').setInputFiles(file);
    await page.getByRole('button', { name: 'Submit application' }).click();
    await expect(page.getByText('Application submitted!')).toBeVisible();
  }
  const { applications } = await apiJson(page, '/api/candidates?q=meron.&limit=20');
  const scores = new Set(applications.map((a) => a.match.score));
  expect(applications).toHaveLength(4);
  expect(scores.size).toBe(1); // same CV, same score in every format
  expect([...scores][0]).toBeGreaterThan(70);

  // A text file renamed to .pdf is caught by its contents
  await page.goto(`/careers/${job}`);
  await page.getByLabel('Full name').fill('Faker');
  await page.getByLabel('Email').fill('faker@example.com');
  await page.getByRole('radiogroup').getByText('Yes').click();
  await page.getByLabel(/How many years/).fill('6');
  await page.locator('#apply-resume').setInputFiles({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not really a pdf') });
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByText('This file is damaged or is not really the type its name says')).toBeVisible();

  // Unsupported types are refused in the browser
  await page.locator('#apply-resume').setInputFiles({ name: 'cv.png', mimeType: 'image/png', buffer: Buffer.from('x') });
  await expect(page.getByText('Upload a PDF, Word (DOC/DOCX), ODT, RTF or TXT file')).toBeVisible();
});
