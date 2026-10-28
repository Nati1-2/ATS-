import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateCv } from '../src/utils/atsScore.js';
import { JOBS, CASES } from './fixtures/validationCvs.js';

// Rule changes must keep the ATS decisions in line with a recruiter's on realistic CVs across fields
const MIN_AGREEMENT = 0.9;

test('validation set: ATS decisions agree with recruiters on 90%+ of realistic CVs, never passing a reject or rejecting a pass', () => {
  const now = new Date('2026-10-28');
  const results = CASES.map((c) => ({ c, decision: rateCv(c.text, JOBS[c.job], { fileName: c.file, now }).decision }));
  const wrong = results.filter((r) => r.decision !== r.c.expect);
  const serious = wrong.filter((r) => r.c.expect !== 'review' && r.decision !== 'review');
  assert.deepEqual(serious.map((r) => r.c.id), [], 'a strong CV rejected or a weak CV passed');
  assert.ok(1 - wrong.length / CASES.length >= MIN_AGREEMENT, `disagreements: ${wrong.map((r) => `${r.c.id} (${r.decision}, expected ${r.c.expect})`).join(', ')}`);
});
