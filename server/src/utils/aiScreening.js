/**
 * AI screening: turns a finished AI analysis into a reject / shortlist decision, the way
 * "AI fit" screening works in commercial ATSs. Each job chooses a mode:
 *
 *   off     the AI only writes its summary (advisory)
 *   review  AI rejections wait in a queue until a recruiter confirms or overturns them
 *   auto    the AI rejects on its own; recruiters can still reinstate anyone
 *
 * Shortlisting is low-risk, so it happens straight away in both modes.
 *
 * Safeguards that apply in every mode:
 * - Only applicants still in Applied who no person has moved are touched.
 * - A CV the AI couldn't read, or one containing text aimed at the AI, always goes to a person.
 * - A must-have skill counts as missing only when the AI explicitly judged it "none".
 * - Scanned CVs (text read by the AI from an image) are never rejected without a person confirming.
 * - A decision a person already reviewed is never redone.
 */
import { Application } from '../models/index.js';
import { aiEnabled } from './ai.js';
import { logActivity } from './activity.js';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9+#]/g, '');

/** Must-have skills the AI explicitly found no evidence for (skills it didn't judge are not counted). */
export function missingMustHaveByAi(job, ai) {
  const judged = new Map((ai?.skills || []).map((s) => [norm(s.skill), s.level]));
  return (job.mustHaveSkills || [])
    .filter((skill) => {
      const aliases = skill.split('|').map(norm).filter(Boolean);
      const levels = aliases.map((a) => judged.get(a)).filter(Boolean);
      return levels.length > 0 && levels.every((l) => l === 'none');
    })
    .map((skill) => skill.split('|')[0].trim());
}

/**
 * Decide what the AI screening rules do with one application.
 * Returns null when the rules don't apply, otherwise
 * { action: 'rejected' | 'pending_reject' | 'advanced' | 'review', reasons, reasonCode?, fitScore, mode, model, decidedAt }.
 */
export function decideWithAi(job, app) {
  const rules = job.aiScreen || {};
  if (!rules.mode || rules.mode === 'off') return null;
  const ai = app.ai;
  if (ai?.status !== 'done') return null;
  if (app.stage !== 'applied' || app.stageSetBy === 'human' || app.aiScreen?.review) return null;

  const base = { fitScore: ai.fitScore, mode: rules.mode, model: ai.model, decidedAt: new Date() };
  const review = (reasons) => ({ ...base, action: 'review', reasons });

  if (ai.readable === false) return review(['The AI could not read this file as a CV — needs manual review']);
  if (ai.injectionAttempt) return review(['The CV contains text aimed at the AI or screening system — a person must review it']);

  const reasons = [];
  let reasonCode;
  if (rules.rejectMissingMustHave) {
    const missing = missingMustHaveByAi(job, ai);
    if (missing.length) {
      reasons.push(`AI found no evidence of must-have skills: ${missing.join(', ')}`);
      reasonCode = 'missing_skills';
    }
  }
  if (rules.rejectBelowFit != null && ai.fitScore < rules.rejectBelowFit) {
    reasons.push(`AI fit ${ai.fitScore}% is below the ${rules.rejectBelowFit}% minimum`);
    reasonCode ??= 'low_ai_fit';
  }
  if (reasons.length) {
    if (ai.rejectionReason) reasons.push(ai.rejectionReason);
    const scanned = app.resumeTextSource === 'ai';
    if (scanned && rules.mode === 'auto') reasons.push('Scanned CV read by AI — held for a recruiter to confirm');
    return { ...base, action: rules.mode === 'auto' && !scanned ? 'rejected' : 'pending_reject', reasons, reasonCode };
  }

  if (rules.advanceAtFit != null && ai.fitScore >= rules.advanceAtFit) {
    const meets = `AI fit ${ai.fitScore}% meets the ${rules.advanceAtFit}% shortlist threshold`;
    if (!app.screeningPassed) return review([`${meets}, but they failed a knockout question`]);
    if (app.match?.flags?.length) return review([`${meets}, but the CV may be keyword-stuffed`]);
    return { ...base, action: 'advanced', reasons: [meets] };
  }
  return review(ai.recommendation === 'reject' && ai.rejectionReason ? [`AI leans towards rejecting: ${ai.rejectionReason}`] : []);
}

/** Store a decision on the application and return the activity to log, if any. */
export function applyAiDecision(app, result) {
  app.aiScreen = result;
  const why = result.reasons.join('; ');
  if (result.action === 'rejected') {
    Object.assign(app, { stage: 'rejected', stageSetBy: 'ai', stageChangedAt: new Date(), autoDecision: 'rejected', autoRejected: true, autoDecisionReasons: result.reasons });
    return { type: 'ai_rejected', message: `Rejected by AI screening: ${why}` };
  }
  if (result.action === 'advanced') {
    Object.assign(app, { stage: 'screening', stageSetBy: 'ai', stageChangedAt: new Date(), autoDecision: 'advanced', autoDecisionReasons: result.reasons });
    return { type: 'ai_advanced', message: `Shortlisted to Screening by AI screening: ${why}` };
  }
  if (result.action === 'pending_reject') return { type: 'ai_flagged', message: `AI screening recommends rejection — waiting for a recruiter: ${why}` };
  return null;
}

/** Decide, store and log in one go. Returns the action taken, or null. */
export async function screenWithAi(job, app, actor) {
  const result = decideWithAi(job, app);
  if (!result) return null;
  const activity = applyAiDecision(app, result);
  await app.save();
  if (activity) await logActivity({ application: app, actor, ...activity });
  return result.action;
}

/**
 * A recruiter confirms or overturns an AI decision. Returns the activity to log, or null when there
 * is nothing to review (no AI decision, already reviewed, or the person has since moved on).
 */
export function reviewAiDecision(app, outcome, user) {
  const d = app.aiScreen;
  if (!d || d.review || !['rejected', 'pending_reject', 'advanced'].includes(d.action)) return null;
  const now = new Date();
  const move = (stage, extra = {}) => Object.assign(app, { stage, stageSetBy: 'human', stageChangedAt: now, ...extra });
  if (d.action === 'pending_reject') {
    if (app.stage !== 'applied') return null;
    if (outcome === 'confirmed') move('rejected', { autoDecision: 'rejected', autoRejected: true, autoDecisionReasons: d.reasons });
  } else if (d.action === 'rejected') {
    if (app.stage !== 'rejected') return null;
    if (outcome === 'overturned') move('applied', { autoDecision: 'review', autoRejected: false });
  } else if (d.action === 'advanced') {
    if (app.stage !== 'screening') return null;
    if (outcome === 'overturned') move('applied', { autoDecision: 'review' });
  }
  app.aiScreen = { ...d, review: { outcome, by: user._id, byName: user.name, at: now } };
  app.markModified('aiScreen');
  const what = { pending_reject: 'AI rejection recommendation', rejected: 'AI rejection', advanced: 'AI shortlist' }[d.action];
  const result =
    outcome === 'confirmed'
      ? d.action === 'pending_reject' ? 'confirmed — moved to Rejected' : 'confirmed'
      : d.action === 'pending_reject' ? 'overturned — kept in Applied' : 'overturned — moved back to Applied';
  return { type: 'ai_reviewed', message: `${what} ${result}`, meta: { outcome, action: d.action } };
}

/**
 * A person moved the candidate by hand: record that as their review of any open AI decision,
 * so AI screening never acts on them again and the overturn rate stays accurate.
 */
export function noteManualStageChange(app, to, user) {
  app.stageSetBy = 'human';
  const d = app.aiScreen;
  if (!d || d.review || !['rejected', 'pending_reject', 'advanced'].includes(d.action)) return;
  const agrees = d.action === 'advanced' ? !['applied', 'rejected'].includes(to) : to === 'rejected';
  app.aiScreen = { ...d, review: { outcome: agrees ? 'confirmed' : 'overturned', by: user._id, byName: user.name, at: new Date() } };
  app.markModified('aiScreen');
}

/**
 * Run a job's AI screening rules on everyone still waiting in Applied.
 * Finished analyses are decided straight away (no AI call needed); missing ones are queued and
 * decided when they finish.
 */
export async function runAiScreeningForJob(job, actor, { enqueue } = {}) {
  const apps = await Application.find({ job: job._id, stage: 'applied', stageSetBy: { $ne: 'human' } });
  const counts = { processed: apps.length, rejected: 0, pending_reject: 0, advanced: 0, review: 0, queued: 0 };
  for (const app of apps) {
    if (app.ai?.status === 'done') {
      const action = await screenWithAi(job, app, actor);
      if (action) counts[action] += 1;
    } else if (aiEnabled() && enqueue && !['pending', 'processing'].includes(app.ai?.status)) {
      app.ai = { status: 'pending' };
      await app.save();
      enqueue(app._id);
      counts.queued += 1;
    }
  }
  return counts;
}

/** Mongo filters for each view of the AI screening page. */
export const AI_SCREEN_VIEWS = {
  pending: { 'aiScreen.action': 'pending_reject', 'aiScreen.review': { $exists: false }, stage: 'applied' },
  rejected: { 'aiScreen.action': 'rejected', 'aiScreen.review': { $exists: false } },
  advanced: { 'aiScreen.action': 'advanced', 'aiScreen.review': { $exists: false } },
  flagged: { 'aiScreen.action': 'review', stage: 'applied', 'aiScreen.reasons.0': { $exists: true } },
  reviewed: { 'aiScreen.review': { $exists: true } },
};
