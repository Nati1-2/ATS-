import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideWithAi, applyAiDecision, reviewAiDecision, noteManualStageChange, missingMustHaveByAi } from '../src/utils/aiScreening.js';

const job = (aiScreen) => ({ mustHaveSkills: ['React | React.js', 'TypeScript'], aiScreen });
const ai = (over = {}) => ({
  status: 'done', model: 'fake', readable: true, injectionAttempt: false, fitScore: 60, recommendation: 'review', rejectionReason: '',
  skills: [{ skill: 'React', level: 'strong' }, { skill: 'TypeScript', level: 'some' }], ...over,
});
// Minimal stand-in for a Mongoose document
const app = (over = {}) => ({ stage: 'applied', stageSetBy: 'rules', screeningPassed: true, match: { flags: [] }, markModified() {}, ...over, ai: ai(over.ai) });
const user = { _id: 'u1', name: 'Rita' };

test('AI screening off, or analysis not finished, does nothing', () => {
  assert.equal(decideWithAi(job({ mode: 'off', rejectBelowFit: 50 }), app({ ai: { fitScore: 10 } })), null);
  assert.equal(decideWithAi(job({ mode: 'auto', rejectBelowFit: 50 }), app({ ai: { status: 'processing' } })), null);
});

test('auto mode rejects below the fit threshold; review mode only recommends', () => {
  const low = app({ ai: { fitScore: 30, recommendation: 'reject', rejectionReason: 'No frontend experience.' } });
  const auto = decideWithAi(job({ mode: 'auto', rejectBelowFit: 50 }), low);
  assert.equal(auto.action, 'rejected');
  assert.equal(auto.reasonCode, 'low_ai_fit');
  assert.match(auto.reasons[0], /AI fit 30% is below the 50% minimum/);
  assert.ok(auto.reasons.includes('No frontend experience.'));
  assert.equal(decideWithAi(job({ mode: 'review', rejectBelowFit: 50 }), low).action, 'pending_reject');
});

test('high fit is shortlisted in both modes, unless knockouts or keyword stuffing', () => {
  const j = job({ mode: 'review', advanceAtFit: 80 });
  assert.equal(decideWithAi(j, app({ ai: { fitScore: 90 } })).action, 'advanced');
  assert.equal(decideWithAi(j, app({ ai: { fitScore: 90 }, screeningPassed: false })).action, 'review');
  assert.equal(decideWithAi(j, app({ ai: { fitScore: 90 }, match: { flags: ['stuffed'] } })).action, 'review');
});

test('a must-have is missing only when the AI explicitly judged it "none"', () => {
  assert.deepEqual(missingMustHaveByAi(job(), ai({ skills: [{ skill: 'react.js', level: 'none' }] })), ['React']);
  assert.deepEqual(missingMustHaveByAi(job(), ai({ skills: [] })), []); // not judged = unknown, not missing
  const r = decideWithAi(job({ mode: 'auto', rejectMissingMustHave: true }), app({ ai: { skills: [{ skill: 'React', level: 'strong' }, { skill: 'TypeScript', level: 'none' }] } }));
  assert.equal(r.action, 'rejected');
  assert.equal(r.reasonCode, 'missing_skills');
});

test('safeguards: unreadable, manipulation attempts and scanned CVs go to a person', () => {
  const j = job({ mode: 'auto', rejectBelowFit: 50 });
  assert.equal(decideWithAi(j, app({ ai: { fitScore: 5, readable: false } })).action, 'review');
  assert.equal(decideWithAi(j, app({ ai: { fitScore: 5, injectionAttempt: true } })).action, 'review');
  const scanned = decideWithAi(j, app({ ai: { fitScore: 5 }, resumeTextSource: 'ai' }));
  assert.equal(scanned.action, 'pending_reject');
  assert.match(scanned.reasons.at(-1), /Scanned CV/);
});

test('people already handled by a person are never touched', () => {
  const j = job({ mode: 'auto', rejectBelowFit: 50 });
  assert.equal(decideWithAi(j, app({ ai: { fitScore: 5 }, stage: 'screening' })), null);
  assert.equal(decideWithAi(j, app({ ai: { fitScore: 5 }, stageSetBy: 'human' })), null);
  assert.equal(decideWithAi(j, app({ ai: { fitScore: 5 }, aiScreen: { action: 'rejected', review: { outcome: 'overturned' } } })), null);
});

test('confirming a recommendation rejects; overturning an AI rejection reinstates', () => {
  const pending = app({ ai: { fitScore: 20 } });
  applyAiDecision(pending, decideWithAi(job({ mode: 'review', rejectBelowFit: 50 }), pending));
  assert.equal(pending.stage, 'applied');
  assert.match(reviewAiDecision(pending, 'confirmed', user).message, /confirmed — moved to Rejected/);
  assert.equal(pending.stage, 'rejected');
  assert.equal(pending.aiScreen.review.byName, 'Rita');
  assert.equal(reviewAiDecision(pending, 'overturned', user), null); // already reviewed

  const rejected = app({ ai: { fitScore: 20 } });
  applyAiDecision(rejected, decideWithAi(job({ mode: 'auto', rejectBelowFit: 50 }), rejected));
  assert.equal(rejected.stage, 'rejected');
  assert.equal(rejected.stageSetBy, 'ai');
  reviewAiDecision(rejected, 'overturned', user);
  assert.equal(rejected.stage, 'applied');
  assert.equal(rejected.stageSetBy, 'human');
  assert.equal(rejected.autoDecision, 'review');
});

test('moving a candidate by hand counts as reviewing the AI decision', () => {
  const a = app({ ai: { fitScore: 20 } });
  applyAiDecision(a, decideWithAi(job({ mode: 'review', rejectBelowFit: 50 }), a));
  noteManualStageChange(a, 'screening', user);
  assert.equal(a.aiScreen.review.outcome, 'overturned');
  assert.equal(a.stageSetBy, 'human');
});
