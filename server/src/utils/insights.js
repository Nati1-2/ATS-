/**
 * Hiring numbers for reports and the AI assistant. Every query is limited to the jobs the
 * user may see (hiring managers: only their assigned jobs). The AI only writes about these
 * numbers — it never computes or invents them.
 */
import mongoose from 'mongoose';
import { Application, Candidate, Interview, Job, STAGES } from '../models/index.js';
import { accessibleJobIds } from '../middleware/auth.js';
import { HttpError, escapeRegex } from './http.js';

const DAY = 24 * 3600 * 1000;
const STUCK_DAYS = 7;
const ACTIVE = ['applied', 'screening', 'interview', 'offer'];
const isId = (v) => typeof v === 'string' && mongoose.isValidObjectId(v);

/** Job ids this user may see, optionally narrowed to one job (checked). */
export async function jobScope(user, jobId) {
  const allowed = await accessibleJobIds(user); // null = all jobs
  if (jobId) {
    if (!isId(jobId)) throw new HttpError(404, 'Job not found');
    const id = new mongoose.Types.ObjectId(jobId);
    if (allowed && !allowed.some((a) => a.equals(id))) throw new HttpError(403, 'You are not assigned to this job');
    if (!(await Job.exists({ _id: id }))) throw new HttpError(404, 'Job not found');
    return [id];
  }
  return allowed ?? (await Job.find().select('_id')).map((j) => j._id);
}

const nameOf = (a) => a.candidate?.fullName ?? 'Unknown';

export async function hiringStats(user, { jobId, now = new Date() } = {}) {
  const jobIds = await jobScope(user, jobId);
  const jobs = await Job.find({ _id: { $in: jobIds } }).select('title status department mustHaveSkills minYearsExperience createdAt publishedAt').lean();
  const apps = await Application.find({ job: { $in: jobIds } })
    .select('candidate job stage createdAt stageChangedAt match.score match.missingMustHave autoDecision ai.fitLevel ai.status')
    .populate('candidate', 'fullName')
    .lean();
  const jobTitle = Object.fromEntries(jobs.map((j) => [String(j._id), j.title]));

  const stageCounts = Object.fromEntries(STAGES.map((s) => [s, 0]));
  const decisions = { advanced: 0, review: 0, rejected: 0 };
  const buckets = [
    { range: '0–24%', min: 0, max: 24, count: 0 },
    { range: '25–49%', min: 25, max: 49, count: 0 },
    { range: '50–74%', min: 50, max: 74, count: 0 },
    { range: '75–100%', min: 75, max: 100, count: 0 },
  ];
  const scores = [];
  const missing = {};
  for (const a of apps) {
    stageCounts[a.stage] += 1;
    if (a.autoDecision) decisions[a.autoDecision] += 1;
    const sc = a.match?.score;
    if (sc != null) {
      scores.push(sc);
      buckets.find((b) => sc >= b.min && sc <= b.max).count += 1;
    }
    for (const sk of a.match?.missingMustHave ?? []) missing[sk] = (missing[sk] ?? 0) + 1;
  }

  // Applications per week, last 8 weeks (oldest first)
  const weekly = [];
  for (let w = 7; w >= 0; w--) {
    const end = new Date(now.getTime() - w * 7 * DAY);
    const start = new Date(end.getTime() - 7 * DAY);
    weekly.push({ weekStart: start.toISOString().slice(0, 10), count: apps.filter((a) => a.createdAt > start && a.createdAt <= end).length });
  }

  const ref = (a) => ({
    name: nameOf(a),
    job: jobTitle[String(a.job)],
    stage: a.stage,
    score: a.match?.score ?? null,
    aiFit: a.ai?.status === 'done' ? a.ai.fitLevel : null,
    applicationId: String(a._id),
    candidateId: String(a.candidate?._id),
  });

  const stuck = apps
    .filter((a) => ['applied', 'screening', 'interview'].includes(a.stage))
    .map((a) => ({ ...ref(a), daysInStage: Math.floor((now - new Date(a.stageChangedAt ?? a.createdAt)) / DAY) }))
    .filter((a) => a.daysInStage >= STUCK_DAYS)
    .sort((x, y) => y.daysInStage - x.daysInStage)
    .slice(0, 10);

  const topCandidates = apps
    .filter((a) => ACTIVE.includes(a.stage) && a.match?.score != null)
    .sort((x, y) => y.match.score - x.match.score)
    .slice(0, 8)
    .map(ref);

  const hired = apps.filter((a) => a.stage === 'hired' && a.stageChangedAt);
  const timeToHireDays = hired.length
    ? Math.round(hired.reduce((t, a) => t + (new Date(a.stageChangedAt) - new Date(a.createdAt)) / DAY, 0) / hired.length)
    : null;

  const upcoming = await Interview.find({ job: { $in: jobIds }, status: 'scheduled', scheduledAt: { $gte: now } })
    .populate('candidate', 'fullName')
    .populate('interviewer', 'name')
    .populate('job', 'title')
    .sort({ scheduledAt: 1 })
    .limit(10)
    .lean();

  return {
    scope: jobId ? { jobId, title: jobs[0]?.title } : { title: 'All jobs you can access', jobCount: jobs.length },
    generatedAt: now,
    totals: {
      applications: apps.length,
      active: apps.filter((a) => ACTIVE.includes(a.stage)).length,
      hired: stageCounts.hired,
      rejected: stageCounts.rejected,
      openJobs: jobs.filter((j) => j.status === 'published').length,
      averageMatch: scores.length ? Math.round(scores.reduce((t, x) => t + x, 0) / scores.length) : null,
      timeToHireDays,
    },
    stages: STAGES.map((stage) => ({ stage, count: stageCounts[stage] })),
    decisions,
    scoreBuckets: buckets.map(({ range, count }) => ({ range, count })),
    weekly,
    stuck,
    topCandidates,
    skillGaps: Object.entries(missing)
      .map(([skill, count]) => ({ skill, missingIn: count, ofApplicants: apps.length }))
      .sort((x, y) => y.missingIn - x.missingIn)
      .slice(0, 6),
    upcomingInterviews: upcoming.map((i) => ({
      when: i.scheduledAt,
      candidate: i.candidate?.fullName,
      candidateId: String(i.candidate?._id),
      job: i.job?.title,
      interviewer: i.interviewer?.name,
    })),
    jobs: jobs.map((j) => ({ id: String(j._id), title: j.title, status: j.status, department: j.department })),
  };
}

/** Candidate search for the assistant (read-only, no contact details). */
export async function findApplications(user, { query, jobId, stage, minScore, decision, sort = 'score', limit = 10 } = {}) {
  const jobIds = await jobScope(user, jobId || undefined);
  const filter = { job: { $in: jobIds } };
  if (stage && STAGES.includes(stage)) filter.stage = stage;
  if (minScore != null && Number.isFinite(Number(minScore))) filter['match.score'] = { $gte: Number(minScore) };
  if (decision && ['advanced', 'review', 'rejected'].includes(decision)) filter.autoDecision = decision;
  if (query) {
    const rx = new RegExp(escapeRegex(String(query).slice(0, 80)), 'i');
    const ids = (await Candidate.find({ fullName: rx }).select('_id')).map((c) => c._id);
    filter.candidate = { $in: ids };
  }
  const apps = await Application.find(filter)
    .select('candidate job stage createdAt stageChangedAt match.score match.missingMustHave match.yearsExperience autoDecision ai.fitLevel ai.status ai.summary')
    .populate('candidate', 'fullName')
    .populate('job', 'title')
    .sort(sort === 'newest' ? { createdAt: -1 } : { 'match.score': -1, createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 10, 1), 25))
    .lean();
  return apps.map((a) => ({
    name: a.candidate?.fullName,
    candidateId: String(a.candidate?._id),
    applicationId: String(a._id),
    job: a.job?.title,
    stage: a.stage,
    appliedOn: a.createdAt?.toISOString().slice(0, 10),
    daysInStage: Math.floor((Date.now() - new Date(a.stageChangedAt ?? a.createdAt)) / DAY),
    cvMatch: a.match?.score ?? null,
    yearsExperience: a.match?.yearsExperience ?? null,
    missingMustHave: a.match?.missingMustHave ?? [],
    automaticDecision: a.autoDecision ?? null,
    aiFit: a.ai?.status === 'done' ? a.ai.fitLevel : null,
    aiSummary: a.ai?.status === 'done' ? a.ai.summary : null,
  }));
}
