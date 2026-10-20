// Real CV files made with LibreOffice (test/fixtures): a two-column table layout with Amharic text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractResumeText, scoreApplication } from '../src/utils/screening.js';
import { verifyResumeSignature } from '../src/utils/uploads.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const job = { title: 'Frontend Engineer', mustHaveSkills: ['React', 'TypeScript'], niceToHaveSkills: ['Next.js'], minYearsExperience: 3 };
const now = new Date('2026-10-19');

for (const ext of ['pdf', 'docx', 'doc', 'odt', 'rtf']) {
  test(`${ext.toUpperCase()}: text, sections, years and score are read correctly`, async () => {
    const file = path.join(dir, `cv.${ext}`);
    assert.equal(verifyResumeSignature(file), true, 'file signature');
    const text = await extractResumeText(file);
    assert.match(text, /Meron Assefa/);
    assert.ok(text.includes('ፊደል'), 'Amharic survives');
    const r = scoreApplication(job, { resumeText: text }, now);
    assert.deepEqual(r.missingMustHave, []);
    assert.equal(r.yearsExperience, 5); // 2020–2025 from the table cell
    assert.equal(r.titleMatch.score, 100);
    assert.ok(r.score >= 90, `score ${r.score}`);
  });
}
