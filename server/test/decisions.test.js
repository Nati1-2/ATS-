import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideApplication } from '../src/utils/screening.js';

const job = (autoScreen, extra = {}) => ({ autoRejectKnockouts: true, autoScreen, ...extra });
const match = (over = {}) => ({ score: 80, missingMustHave: [], yearsExperience: 6, education: { level: 'bachelor', label: "Bachelor's degree" }, flags: [], ...over });
const ok = { screeningPassed: true, resumeReadable: true };

test('high score is shortlisted, low score rejected, middle needs review', () => {
  const j = job({ rejectBelowScore: 40, advanceAtScore: 75 });
  assert.equal(decideApplication(j, { ...ok, match: match({ score: 90 }) }).decision, 'advanced');
  assert.equal(decideApplication(j, { ...ok, match: match({ score: 20 }) }).decision, 'rejected');
  assert.equal(decideApplication(j, { ...ok, match: match({ score: 60 }) }).decision, null);
});

test('knockout failure rejects even a perfect score', () => {
  const r = decideApplication(job({ advanceAtScore: 50 }), { ...ok, screeningPassed: false, match: match({ score: 100 }) });
  assert.equal(r.decision, 'rejected');
});

test('unreadable CV is never rejected on CV rules', () => {
  const r = decideApplication(job({ rejectBelowScore: 40 }), { screeningPassed: true, resumeReadable: false, match: match({ score: 0 }) });
  assert.equal(r.decision, null);
  assert.match(r.reasons[0], /could not be read/);
});

test('unknown experience goes to review; known but too little is rejected', () => {
  const j = job({ rejectBelowMinYears: true }, { minYearsExperience: 5 });
  const unknown = decideApplication(j, { ...ok, match: match({ yearsExperience: null }) });
  assert.equal(unknown.decision, null);
  assert.match(unknown.reasons[0], /could not be determined/);
  assert.equal(decideApplication(j, { ...ok, match: match({ yearsExperience: 2 }) }).decision, 'rejected');
});

test('missing degree goes to review; lower degree is rejected', () => {
  const j = job({ rejectMissingEducation: true }, { minEducation: 'master' });
  assert.equal(decideApplication(j, { ...ok, match: match({ education: null }) }).decision, null);
  assert.equal(decideApplication(j, { ...ok, match: match() }).decision, 'rejected');
});

test('suspected keyword stuffing blocks auto-shortlisting', () => {
  const r = decideApplication(job({ advanceAtScore: 50 }), { ...ok, match: match({ score: 95, flags: ['"React" repeated 20 times'] }) });
  assert.equal(r.decision, null);
  assert.match(r.reasons[0], /keyword stuffing/);
});
