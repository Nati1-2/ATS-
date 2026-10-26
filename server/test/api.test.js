/*
 * End-to-end API tests against a real MongoDB (a separate "ats_test" database that is wiped).
 * Set MONGODB_URI_TEST to point elsewhere; the suite is skipped if MongoDB is unreachable.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-tests-123456';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ats-test-uploads-'));
process.env.LOGIN_FAILURES_PER_15_MIN = '5'; // small limit so the rate-limit test is quick
const MONGO = process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/ats_test';

const { default: mongoose } = await import('mongoose');
let skip = false;
try {
  await mongoose.connect(MONGO, { serverSelectionTimeoutMS: 2000 });
  if (!/test/i.test(mongoose.connection.name)) throw new Error(`refusing to wipe non-test database "${mongoose.connection.name}"`);
  await mongoose.connection.dropDatabase();
} catch (err) {
  skip = `MongoDB not available (${err.message})`;
}

const { createApp } = await import('../src/app.js');
const { User } = await import('../src/models/index.js');
const { default: bcrypt } = await import('bcryptjs');

let base;
let server;
if (!skip) {
  const passwordHash = await bcrypt.hash('Password123!', 4);
  await User.create([
    { name: 'Admin', email: 'admin@t.test', role: 'admin', passwordHash },
    { name: 'Rita Recruiter', email: 'rec@t.test', role: 'recruiter', passwordHash },
    { name: 'Hank Manager', email: 'hm@t.test', role: 'hiring_manager', passwordHash },
  ]);
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
}

after(async () => {
  server?.close();
  if (!skip) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

/** Tiny client that keeps the auth cookie between calls. */
function client() {
  let cookie = '';
  return async (method, url, body) => {
    const opts = { method, headers: cookie ? { cookie } : {} };
    if (body instanceof FormData) opts.body = body;
    else if (body !== undefined) {
      opts.body = JSON.stringify(body);
      opts.headers['content-type'] = 'application/json';
    }
    const res = await fetch(base + url, opts);
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.arrayBuffer() };
  };
}

async function docx(lines) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${lines.map((l) => `<w:p><w:r><w:t>${l}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

function application(jobQuestions, { name, email, answers, file, filename, type }) {
  const fd = new FormData();
  fd.append('fullName', name);
  fd.append('email', email);
  fd.append('answers', JSON.stringify(Object.fromEntries(jobQuestions.map((q, i) => [q._id, answers[i]]))));
  fd.append('resume', new Blob([file], { type }), filename);
  return fd;
}

const opts = { skip };
const rec = client();
const hm = client();
const anon = client();
let job;
let questions;

test('health check reports the database', opts, async () => {
  const r = await anon('GET', '/health');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, db: true });
});

test('login: wrong password is rejected, right one sets a session', opts, async () => {
  assert.equal((await rec('POST', '/auth/login', { email: 'rec@t.test', password: 'nope' })).status, 401);
  const r = await rec('POST', '/auth/login', { email: 'rec@t.test', password: 'Password123!' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, 'recruiter');
  assert.equal((await hm('POST', '/auth/login', { email: 'hm@t.test', password: 'Password123!' })).status, 200);
});

test('admin from .env: only bootstraps an empty install; the database stays the source of truth', opts, async () => {
  const { ensureEnvAdmin } = await import('../src/utils/envAdmin.js');
  const env = { ADMIN_EMAIL: 'Boss@T.test', ADMIN_PASSWORD: 'EnvPassword1', ADMIN_NAME: 'Boss' };
  // An active admin already exists, so .env is ignored
  assert.equal(await ensureEnvAdmin(env), null);
  assert.equal(await User.exists({ email: 'boss@t.test' }), null);

  const admins = await User.find({ role: 'admin', active: true }).select('_id');
  await User.updateMany({ _id: { $in: admins } }, { active: false });
  try {
    await ensureEnvAdmin(env);
    const boss = client();
    assert.equal((await boss('POST', '/auth/login', { email: 'boss@t.test', password: 'EnvPassword1' })).body.user.role, 'admin');

    // Later .env changes never touch the stored account
    await ensureEnvAdmin({ ...env, ADMIN_PASSWORD: 'EnvPassword2' });
    // Checked directly rather than by a failed login, which would count towards the rate-limit test's budget
    const { passwordHash } = await User.findOne({ email: 'boss@t.test' }).select('+passwordHash');
    assert.equal(await bcrypt.compare('EnvPassword1', passwordHash), true);
    assert.equal(await ensureEnvAdmin({}), null);
  } finally {
    await User.deleteOne({ email: 'boss@t.test' });
    await User.updateMany({ _id: { $in: admins } }, { active: true });
  }
});

test('admin creates accounts in any role; others cannot', opts, async () => {
  const admin = client();
  await admin('POST', '/auth/login', { email: 'admin@t.test', password: 'Password123!' });
  const r = await admin('POST', '/settings/team/users', { name: 'New Manager', email: 'newhm@t.test', role: 'hiring_manager', password: 'Welcome123' });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.role, 'hiring_manager');
  const newbie = client();
  assert.equal((await newbie('POST', '/auth/login', { email: 'newhm@t.test', password: 'Welcome123' })).body.user.role, 'hiring_manager');

  const dup = await admin('POST', '/settings/team/users', { name: 'Again', email: 'newhm@t.test', role: 'recruiter', password: 'Welcome123' });
  assert.equal(dup.status, 409);
  assert.ok(dup.body.fields.email);
  assert.equal((await admin('POST', '/settings/team/users', { name: 'X Y', email: 'x@t.test', role: 'owner', password: 'Welcome123' })).status, 400);
  assert.equal((await rec('POST', '/settings/team/users', { name: 'Sneaky', email: 'sneaky@t.test', role: 'admin', password: 'Welcome123' })).status, 403);
});

test('internal endpoints require a session', opts, async () => {
  assert.equal((await anon('GET', '/jobs')).status, 401);
  assert.equal((await anon('GET', '/candidates')).status, 401);
});

test('job validation returns field errors', opts, async () => {
  const r = await rec('POST', '/jobs', { title: 'x', autoScreen: { rejectBelowScore: 80, advanceAtScore: 50 } });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.title && r.body.fields.department && r.body.fields['autoScreen.advanceAtScore']);
});

test('recruiter publishes a job with screening rules', opts, async () => {
  const r = await rec('POST', '/jobs', {
    title: 'Backend Engineer',
    department: 'Engineering',
    location: 'Remote',
    remotePolicy: 'remote',
    employmentType: 'full_time',
    description: 'Build and run the APIs behind our platform.',
    status: 'published',
    mustHaveSkills: ['Node.js', 'MongoDB', 'Kubernetes'],
    niceToHaveSkills: ['AWS'],
    minYearsExperience: 3,
    screeningQuestions: [{ question: 'Are you authorized to work here?', type: 'yes_no', required: true, knockout: true, expectedAnswer: 'yes' }],
    autoRejectKnockouts: true,
    autoScreen: { rejectBelowScore: 40, advanceAtScore: 75 },
  });
  assert.equal(r.status, 201);
  job = r.body.job;
  assert.equal(job.status, 'published');
  const pub = await anon('GET', `/public/jobs/${job._id}`);
  questions = pub.body.job.screeningQuestions;
  assert.equal(questions.length, 1);
  assert.equal(questions[0].knockout, undefined, 'knockout rules must not be public');
});

test('strong DOCX CV (with synonyms) is auto-shortlisted', opts, async () => {
  const file = await docx([
    'Selam Girma — Senior Backend Developer',
    'Experience',
    'Backend Developer, Safaricom (Jan 2019 - Present)',
    'Built NodeJS services on Mongo, deployed to K8s on Amazon Web Services.',
  ]);
  const r = await anon('POST', `/public/jobs/${job._id}/apply`, application(questions, {
    name: 'Selam Girma', email: 'selam@t.test', answers: ['yes'], file, filename: 'selam.docx', type: 'application/octet-stream',
  }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const list = await rec('GET', `/candidates?job=${job._id}`);
  const app = list.body.applications.find((a) => a.candidate.email === 'selam@t.test');
  assert.equal(app.autoDecision, 'advanced');
  assert.equal(app.stage, 'screening');
  assert.ok(app.match.score >= 75, `score ${app.match.score}`);
});

test('weak TXT CV is auto-rejected with a reason', opts, async () => {
  const file = Buffer.from('Abel Tadesse\nExperience\nCashier, Shoa Supermarket (2023 - Present)\n');
  const r = await anon('POST', `/public/jobs/${job._id}/apply`, application(questions, {
    name: 'Abel Tadesse', email: 'abel@t.test', answers: ['yes'], file, filename: 'abel.txt', type: 'text/plain',
  }));
  assert.equal(r.status, 201);
  const list = await rec('GET', `/candidates?job=${job._id}&decision=rejected`);
  const app = list.body.applications.find((a) => a.candidate.email === 'abel@t.test');
  assert.equal(app.stage, 'rejected');
  const profile = await rec('GET', `/candidates/${app.candidate._id}`);
  assert.match(profile.body.applications[0].autoDecisionReasons[0], /below the 40% minimum/);
});

test('failing a knockout question rejects even a perfect CV', opts, async () => {
  const file = await docx(['Experience', 'Backend Engineer (2015 - Present): Node.js, MongoDB, Kubernetes, AWS']);
  await anon('POST', `/public/jobs/${job._id}/apply`, application(questions, {
    name: 'Dawit Lemma', email: 'dawit@t.test', answers: ['no'], file, filename: 'dawit.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }));
  const list = await rec('GET', `/candidates?job=${job._id}&screening=failed`);
  assert.deepEqual(list.body.applications.map((a) => [a.candidate.email, a.stage]), [['dawit@t.test', 'rejected']]);
});

test('uploads: renamed files, missing answers and duplicates are refused', opts, async () => {
  const fake = await anon('POST', `/public/jobs/${job._id}/apply`, application(questions, {
    name: 'Faker', email: 'fake@t.test', answers: ['yes'], file: Buffer.from('not a pdf'), filename: 'cv.pdf', type: 'application/pdf',
  }));
  assert.equal(fake.status, 400);
  assert.ok(fake.body.fields.resume);

  const exe = await anon('POST', `/public/jobs/${job._id}/apply`, application(questions, {
    name: 'Exe', email: 'exe@t.test', answers: ['yes'], file: Buffer.from('MZ'), filename: 'cv.exe', type: 'application/x-msdownload',
  }));
  assert.equal(exe.status, 400);

  const noAnswer = await anon('POST', `/public/jobs/${job._id}/apply`, application(questions, {
    name: 'No Answer', email: 'na@t.test', answers: [''], file: Buffer.from('Experience\nDev'), filename: 'cv.txt', type: 'text/plain',
  }));
  assert.equal(noAnswer.status, 400);

  const dup = await anon('POST', `/public/jobs/${job._id}/apply`, application(questions, {
    name: 'Abel Tadesse', email: 'abel@t.test', answers: ['yes'], file: Buffer.from('Experience\nDev'), filename: 'cv.txt', type: 'text/plain',
  }));
  assert.equal(dup.status, 409);
});

test('résumés are private: anonymous 401, recruiter can download', opts, async () => {
  const list = await rec('GET', `/candidates?job=${job._id}`);
  const id = list.body.applications[0]._id;
  assert.equal((await anon('GET', `/applications/${id}/resume`)).status, 401);
  const dl = await rec('GET', `/applications/${id}/resume`);
  assert.equal(dl.status, 200);
  assert.ok(dl.body.byteLength > 0);

  // Files are kept in the database, so a new server instance with an empty upload folder still serves them
  const dir = path.join(process.env.UPLOAD_DIR, 'resumes');
  for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
  const again = await rec('GET', `/applications/${id}/resume`);
  assert.equal(again.status, 200);
  assert.deepEqual(Buffer.from(again.body), Buffer.from(dl.body));
});

test('hiring managers only see their assigned jobs and cannot move stages', opts, async () => {
  const list = await rec('GET', `/candidates?job=${job._id}`);
  const app = list.body.applications[0];
  assert.equal((await hm('GET', `/candidates/${app.candidate._id}`)).status, 403);
  assert.equal((await hm('GET', '/applications/feed')).body.items.length, 0);
  assert.equal((await hm('PATCH', `/applications/${app._id}/stage`, { stage: 'hired' })).status, 403);
});

test('editing the job\'s skills re-scores existing applicants', opts, async () => {
  const before = (await rec('GET', `/candidates?job=${job._id}&sort=score`)).body.applications;
  const r = await rec('PUT', `/jobs/${job._id}`, { ...job, mustHaveSkills: ['Node.js', 'MongoDB'], niceToHaveSkills: [] });
  assert.equal(r.status, 200);
  assert.equal(r.body.rescored, before.length);
});

test('closed jobs refuse applications', opts, async () => {
  await rec('POST', `/jobs/${job._id}/close`);
  const r = await anon('POST', `/public/jobs/${job._id}/apply`, application(questions, {
    name: 'Late', email: 'late@t.test', answers: ['yes'], file: Buffer.from('Experience\nDev'), filename: 'cv.txt', type: 'text/plain',
  }));
  assert.equal(r.status, 400);
  assert.match(r.body.error, /closed/);
});

test('dashboard numbers come from stored data', opts, async () => {
  const d = (await rec('GET', '/dashboard')).body;
  assert.equal(d.stats.totalApplications, 3);
  assert.equal(d.stats.openJobs, 0);
  assert.deepEqual(d.screening, { rejected: 2, advanced: 1, review: 0 });
});

test('AI: rate limits are retried later automatically, then the analysis completes', opts, async () => {
  const { processApplication } = await import('../src/utils/aiQueue.js');
  const { Application } = await import('../src/models/index.js');
  const app = await Application.findOne({});
  const rateLimited = async () => { throw Object.assign(new Error('quota'), { status: 429 }); };
  // ai.js itself retries a few times first; then the queue parks it as pending instead of failing
  await processApplication(app._id, { generate: rateLimited, retryDelayMs: 1 });
  let saved = await Application.findById(app._id);
  assert.equal(saved.ai.status, 'pending');
  assert.equal(saved.ai.waitingForRateLimit, true);
  assert.equal(saved.ai.rateLimitRetries, 1);

  const ok = async () => ({ text: JSON.stringify({ readable: true, cvText: '', summary: 'ok', strengths: [], concerns: [], fitLevel: 'good', fitScore: 70, currentTitle: null, yearsExperience: null, skills: [], injectionAttempt: false }) });
  await processApplication(app._id, { generate: ok });
  saved = await Application.findById(app._id);
  assert.equal(saved.ai.status, 'done');
  assert.equal(saved.ai.fitLevel, 'good');
});

test('candidates can be filtered and sorted by AI fit', opts, async () => {
  const { Application } = await import('../src/models/index.js');
  const [a, b, c] = await Application.find({}).sort({ createdAt: 1 });
  await Application.updateOne({ _id: a._id }, { $set: { ai: { status: 'done', fitLevel: 'good', fitScore: 70 } } });
  await Application.updateOne({ _id: b._id }, { $set: { ai: { status: 'done', fitLevel: 'strong', fitScore: 90 } } });
  await Application.updateOne({ _id: c._id }, { $set: { ai: { status: 'done', fitLevel: 'weak', fitScore: 20 } } });

  const filtered = (await rec('GET', '/candidates?minAiFit=60')).body.applications;
  assert.deepEqual(filtered.map((x) => x._id).sort(), [a._id.toString(), b._id.toString()].sort());

  const sorted = (await rec('GET', '/candidates?sort=ai')).body.applications;
  assert.deepEqual(sorted.slice(0, 3).map((x) => x.ai.fitScore), [90, 70, 20]);
});

test('rate limit: successful sign-ins never count, repeated failures are blocked with a clear message', opts, async () => {
  const c = client();
  for (let i = 0; i < 10; i++) {
    assert.equal((await c('POST', '/auth/login', { email: 'admin@t.test', password: 'Password123!' })).status, 200);
  }
  // Earlier tests already made one failed attempt; keep failing until blocked (limit is 5)
  let failures = 0;
  let blocked;
  for (let i = 0; i < 10; i++) {
    const r = await c('POST', '/auth/login', { email: 'admin@t.test', password: 'wrong' });
    if (r.status === 429) {
      blocked = r;
      break;
    }
    assert.equal(r.status, 401);
    failures += 1;
  }
  assert.ok(blocked, 'repeated failures must be blocked');
  assert.ok(failures >= 4 && failures <= 5, `blocked after ${failures} failures`);
  assert.match(blocked.body.error, /Too many failed sign-in attempts/);
});

// ---------------------------------------------------------------------------
// AI reports and assistant (fake model — no network, no quota)
// ---------------------------------------------------------------------------
const { setGenerateForTests } = await import('../src/utils/ai.js');
async function withFakeAi(fake, fn) {
  const before = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';
  setGenerateForTests(fake);
  try {
    return await fn();
  } finally {
    setGenerateForTests(null);
    process.env.GEMINI_API_KEY = before ?? '';
  }
}

test('reports: numbers only when AI is off', opts, async () => {
  const r = await rec('POST', '/ai/reports', { jobId: job._id });
  assert.equal(r.status, 201);
  assert.equal(r.body.report.aiStatus, 'disabled');
  assert.equal(r.body.report.stats.totals.applications, 3);
  assert.deepEqual(r.body.report.stats.decisions, { advanced: 1, review: 0, rejected: 2 });
  const list = await rec('GET', '/ai/reports');
  assert.ok(list.body.reports.some((x) => x._id === r.body.report._id));
});

test('reports: AI narrative is stored; notes about unknown candidates are dropped', opts, async () => {
  const fake = async (req) => {
    const data = JSON.parse(req.contents[0].parts[0].text.split('\n').slice(1, -2).join('\n'));
    return {
      text: JSON.stringify({
        headline: `${data.totals.applications} applications`,
        summary: 'Summary.',
        highlights: ['Good'],
        risks: ['Risk'],
        recommendations: ['Do this'],
        candidateNotes: [
          { applicationId: data.topCandidates[0]?.applicationId ?? 'x', note: 'Real candidate' },
          { applicationId: '000000000000000000000000', note: 'Made-up candidate' },
        ],
      }),
    };
  };
  const r = await withFakeAi(fake, () => rec('POST', '/ai/reports', {}));
  assert.equal(r.status, 201);
  assert.equal(r.body.report.aiStatus, 'done');
  assert.equal(r.body.report.narrative.headline, '3 applications');
  assert.equal(r.body.report.narrative.candidateNotes.length, 1);
});

test('reports: hiring managers cannot report on jobs they are not assigned to', opts, async () => {
  assert.equal((await hm('POST', '/ai/reports', { jobId: job._id })).status, 403);
});

test('assistant: off when no key; uses read-only tools within the user’s permissions', opts, async () => {
  const question = { messages: [{ role: 'user', content: 'Who are the best candidates?' }] };
  assert.equal((await rec('POST', '/ai/chat', question)).status, 400);

  const seen = [];
  const fake = async (req) => {
    const last = req.contents.at(-1).parts[0];
    if (last.functionResponse) {
      const result = last.functionResponse.response.result;
      seen.push(result.length);
      return { text: `Found ${result.length}: ${result.map((a) => a.name).join(', ')}` };
    }
    assert.ok(req.config.tools[0].functionDeclarations.every((t) => /^(list|get|search)_/.test(t.name)), 'read-only tools only');
    return { functionCalls: [{ name: 'search_candidates', args: { sort: 'score' } }], candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'search_candidates', args: {} } }] } }] };
  };
  const recAnswer = await withFakeAi(fake, () => rec('POST', '/ai/chat', question));
  assert.equal(recAnswer.status, 200);
  assert.match(recAnswer.body.reply, /^Found 3: /);
  assert.deepEqual(recAnswer.body.tools, ['search_candidates']);
  assert.ok(!JSON.stringify(recAnswer.body).includes('@t.test'), 'no contact details reach the AI');

  const hmAnswer = await withFakeAi(fake, () => hm('POST', '/ai/chat', question));
  assert.equal(hmAnswer.body.reply, 'Found 0:'); // not assigned to this job → sees nothing
});

// ---------------------------------------------------------------------------
// AI screening (fake model)
// ---------------------------------------------------------------------------
test('AI screening: auto mode rejects a weak CV, the job validates its rules, and a recruiter can reinstate', opts, async () => {
  const { processApplication } = await import('../src/utils/aiQueue.js');
  const { Application, Candidate } = await import('../src/models/index.js');
  const base = {
    title: 'Frontend Engineer', department: 'Engineering', location: 'Remote', remotePolicy: 'remote', employmentType: 'full_time',
    description: 'Build the web app our customers use every day.', status: 'published', mustHaveSkills: ['React'],
  };
  const bad = await rec('POST', '/jobs', { ...base, aiScreen: { mode: 'auto' } });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.fields['aiScreen.rejectBelowFit']);

  const created = await rec('POST', '/jobs', { ...base, aiScreen: { mode: 'auto', rejectBelowFit: 50, advanceAtFit: 85 } });
  assert.equal(created.status, 201);
  const aiJob = created.body.job;
  const person = await Candidate.create({ fullName: 'Weak Fit', email: 'weak.fit@t.test' });
  const app = await Application.create({ candidate: person._id, job: aiJob._id, resumeText: 'Experience\nBarista', resumeTextExtracted: true });

  const weak = async () => ({ text: JSON.stringify({ readable: true, cvText: '', summary: 'Barista.', strengths: [], concerns: [], fitLevel: 'weak', fitScore: 12, recommendation: 'reject', rejectionReason: 'No software development experience.', currentTitle: 'Barista', yearsExperience: 2, skills: [{ skill: 'React', level: 'none', evidence: '' }], injectionAttempt: false }) });
  await processApplication(app._id, { generate: weak });
  let saved = await Application.findById(app._id);
  assert.equal(saved.stage, 'rejected');
  assert.equal(saved.aiScreen.action, 'rejected');
  assert.ok(saved.aiScreen.reasons.includes('No software development experience.'));

  const list = await rec('GET', `/ai-screening?view=rejected&job=${aiJob._id}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.counts.rejected, 1);
  assert.equal((await hm('POST', '/ai-screening/review', { ids: [String(app._id)], outcome: 'overturned' })).status, 403);
  assert.equal((await hm('GET', `/ai-screening?job=${aiJob._id}`)).status, 404); // not assigned to this job

  const r = await rec('POST', '/ai-screening/review', { ids: [String(app._id)], outcome: 'overturned' });
  assert.deepEqual(r.body, { updated: 1, skipped: 0 });
  saved = await Application.findById(app._id);
  assert.equal(saved.stage, 'applied');
  assert.equal(saved.aiScreen.review.outcome, 'overturned');
  const after = await rec('GET', '/ai-screening?view=reviewed');
  assert.equal(after.body.accuracy.reject.overturnRate, 100);

  // Re-running AI screening leaves the reinstated person alone
  const rerun = await rec('POST', `/jobs/${aiJob._id}/run-ai-screening`);
  assert.equal(rerun.body.processed, 0);
});

test('CV checker: replies at once with quick checks, the AI review (fake AI) follows, and the file is not kept', opts, async () => {
  const { setGenerateForTests } = await import('../src/utils/ai.js');
  process.env.GEMINI_API_KEY ||= 'test-key';
  const review = { readable: true, overallScore: 64, headline: 'Good base, hidden results.', summary: 'Add numbers.', detectedRole: 'Backend developer', seniority: 'mid', scores: Object.fromEntries(['impact', 'clarity', 'structure', 'skills', 'atsReadability'].map((k) => [k, { score: 60, comment: 'ok' }])), strengths: ['Node.js'], weaknesses: [{ issue: 'No results', why: 'Recruiters skim for impact', fix: 'Add numbers' }], suggestions: [{ priority: 'high', area: 'impact', suggestion: 'Quantify' }], rewrites: [], sectionFeedback: [], missingKeywords: ['Kubernetes'], tips: [], injectionAttempt: false };
  setGenerateForTests(async () => ({ text: JSON.stringify(review) }));
  try {
    const before = fs.readdirSync(path.join(process.env.UPLOAD_DIR, 'resumes')).length;
    const fd = new FormData();
    fd.append('jobId', job._id);
    fd.append('resume', new Blob([await docx(['Experience', 'Backend Developer (2019 - Present)', 'Worked on Node.js and MongoDB APIs', 'Skills', 'Node.js, MongoDB'])], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'cv.docx');
    const r = await rec('POST', '/cv-checker', fd);
    assert.equal(r.status, 201);
    assert.equal(r.body.check.aiStatus, 'pending', 'replies with the quick checks before the AI review');
    assert.equal(r.body.check.jobTitle, 'Backend Engineer');
    assert.ok(r.body.check.quick.checks.some((c) => c.id === 'keywords'));
    let done;
    for (let i = 0; i < 50 && done?.aiStatus !== 'done'; i++) {
      done = (await rec('GET', `/cv-checker/${r.body.check._id}`)).body.check;
      if (done.aiStatus !== 'done') await new Promise((res) => setTimeout(res, 50));
    }
    assert.equal(done.aiStatus, 'done');
    assert.equal(done.review.overallScore, 64);
    const uploads = () => fs.readdirSync(path.join(process.env.UPLOAD_DIR, 'resumes')).length;
    for (let i = 0; i < 20 && uploads() !== before; i++) await new Promise((res) => setTimeout(res, 50)); // deleted after the review
    assert.equal(uploads(), before);

    // Fix: the person picks what to fix and confirms; the rewrite (fake AI) follows in the background
    const fixed = { improvedCv: 'Backend Developer\nExperience\n- Built Node.js APIs serving [number of users]', changes: [{ area: 'Impact', change: 'Added results' }], stillMissing: ['[number of users]'] };
    setGenerateForTests(async () => ({ text: JSON.stringify(fixed) }));
    assert.equal((await rec('POST', `/cv-checker/${r.body.check._id}/fix`, { items: [] })).status, 400);
    const started = await rec('POST', `/cv-checker/${r.body.check._id}/fix`, { items: ['No results — add numbers'], skills: ['Kubernetes'] });
    assert.equal(started.status, 202);
    assert.equal(started.body.check.fix.status, 'pending');
    assert.equal(started.body.check.cvText, undefined, 'the CV text is never sent back');
    let fix;
    for (let i = 0; i < 50 && fix?.status !== 'done'; i++) {
      fix = (await rec('GET', `/cv-checker/${r.body.check._id}`)).body.check.fix;
      if (fix?.status !== 'done') await new Promise((res) => setTimeout(res, 50));
    }
    assert.equal(fix.result.improvedCv, fixed.improvedCv);
    const docxRes = await rec('GET', `/cv-checker/${r.body.check._id}/fix.docx`);
    assert.equal(docxRes.status, 200);
    assert.ok(docxRes.body.byteLength > 500);
    assert.equal((await hm('POST', `/cv-checker/${r.body.check._id}/fix`, { items: ['x'] })).status, 404);

    // A check made before CV text was kept: it asks for the file again, then rewrites from the upload
    const { CvCheck } = await import('../src/models/index.js');
    await CvCheck.updateOne({ _id: r.body.check._id }, { $unset: { cvText: 1, fix: 1 } });
    assert.equal((await rec('GET', `/cv-checker/${r.body.check._id}`)).body.check.hasCvText, false);
    const noFile = await rec('POST', `/cv-checker/${r.body.check._id}/fix`, { items: ['No results'] });
    assert.equal(noFile.status, 400);
    assert.ok(noFile.body.fields.resume);
    const again = new FormData();
    again.append('payload', JSON.stringify({ items: ['No results'] }));
    again.append('resume', new Blob([await docx(['Experience', 'Backend Developer (2019 - Present)', 'Skills', 'Node.js'])], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'cv.docx');
    const reup = await rec('POST', `/cv-checker/${r.body.check._id}/fix`, again);
    assert.equal(reup.status, 202);
    assert.equal(reup.body.check.hasCvText, true);
    for (let i = 0; i < 50 && (await rec('GET', `/cv-checker/${r.body.check._id}`)).body.check.fix.status !== 'done'; i++) await new Promise((res) => setTimeout(res, 50));

    const list = await rec('GET', '/cv-checker');
    assert.equal(list.body.checks[0]._id, r.body.check._id);
    assert.equal((await hm('GET', `/cv-checker/${r.body.check._id}`)).status, 404); // other people's checks are private
    assert.equal((await rec('POST', '/cv-checker', { text: 'too short' })).status, 400);
    assert.equal((await rec('DELETE', `/cv-checker/${r.body.check._id}`)).status, 200);
  } finally {
    setGenerateForTests(null);
    if (process.env.GEMINI_API_KEY === 'test-key') delete process.env.GEMINI_API_KEY;
  }
});

// ---------------------------------------------------------------------------
// Job seekers: check your CV, sign up, see the score, pay, and an admin unlocks the full report
// ---------------------------------------------------------------------------

/** Client with a real cookie jar: the seeker flow uses a claim cookie and a session cookie together. */
function jarClient(cookies = {}) {
  return async (method, url, body) => {
    const opts = { method, headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') } };
    if (body instanceof FormData) opts.body = body;
    else if (body !== undefined) {
      opts.body = JSON.stringify(body);
      opts.headers['content-type'] = 'application/json';
    }
    const res = await fetch(base + url, opts);
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const [k, v] = pair.split('=');
      if (!v || attrs.some((a) => /expires=thu, 01 jan 1970/i.test(a.trim()))) delete cookies[k];
      else cookies[k] = v;
    }
    return { status: res.status, body: await res.json(), cookies };
  };
}

test('job seeker: CV checked before sign-up is claimed; only the score shows until an admin approves the payment', opts, async () => {
  const review = { readable: true, overallScore: 58, headline: 'Solid, but results are hidden.', summary: 'Add numbers.', detectedRole: 'Backend developer', seniority: 'mid', scores: Object.fromEntries(['impact', 'clarity', 'structure', 'skills', 'atsReadability'].map((k) => [k, { score: 55, comment: 'ok' }])), strengths: ['Node.js'], weaknesses: [], suggestions: [{ priority: 'high', area: 'impact', suggestion: 'Quantify results' }], rewrites: [], sectionFeedback: [], missingKeywords: [], tips: [], injectionAttempt: false };
  const seeker = jarClient();
  const cv = await docx(['Experience', 'Backend Developer (2019 - Present)', 'Worked on Node.js APIs', 'Skills', 'Node.js']);

  const { SeekerCheck } = await import('../src/models/index.js');
  const checked = await withFakeAi(async () => ({ text: JSON.stringify(review) }), async () => {
    const fd = new FormData();
    fd.append('resume', new Blob([cv]), 'my-cv.docx');
    const r = await seeker('POST', '/seeker/check', fd);
    // The upload replies first; keep the fake AI on until the background review has finished
    for (let i = 0; i < 50; i++) {
      const c = await SeekerCheck.findById(r.body.id);
      if (c && c.aiStatus !== 'pending') break;
      await new Promise((res) => setTimeout(res, 50));
    }
    return r;
  });
  assert.equal(checked.status, 201, JSON.stringify(checked.body));
  assert.equal(checked.body.signedIn, false);
  assert.ok(checked.cookies.seeker_claim, 'signed-out check is held with a claim cookie');
  assert.equal((await seeker('GET', '/seeker/checks')).status, 401);

  // Sign-up claims the check; the score is visible but the report stays locked
  const signup = await seeker('POST', '/seeker/signup', { name: 'Hana Bekele', email: 'Hana@T.test', password: 'Password123!' });
  assert.equal(signup.status, 201);
  assert.deepEqual(signup.body.seeker.premium, false);
  // The AI review finishes in the background after the upload returns
  let list;
  for (let i = 0; i < 50; i++) {
    list = await seeker('GET', '/seeker/checks');
    if (list.body.checks.length && !list.body.checks[0].pending) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(list.body.checks.length, 1);
  assert.equal(list.body.checks[0].score, 58);
  assert.equal(list.body.checks[0].locked, true);
  const locked = await seeker('GET', `/seeker/checks/${checked.body.id}`);
  assert.equal(locked.body.check.review, undefined, 'the full review must not be sent before the upgrade');
  assert.equal(locked.body.check.quick, undefined);
  assert.equal((await seeker('POST', '/seeker/signup', { name: 'Again', email: 'hana@t.test', password: 'Password123!' })).status, 409);

  // A seeker session is never a staff session
  assert.equal((await seeker('GET', '/jobs')).status, 401);
  assert.equal((await seeker('GET', '/payments')).status, 401);
  assert.equal((await jarClient()('GET', `/seeker/checks/${checked.body.id}`)).status, 401);

  // Applying while signed in shows the application on the dashboard, in applicant-friendly words
  const open = (await rec('POST', '/jobs', { title: 'Support Engineer', department: 'Engineering', location: 'Remote', remotePolicy: 'remote', employmentType: 'full_time', description: 'Help customers get the most out of the platform.', status: 'published' })).body.job;
  const applied = await seeker('POST', `/public/jobs/${open._id}/apply`, application([], {
    name: 'Hana Bekele', email: 'hana@t.test', answers: [], file: cv, filename: 'hana.docx', type: 'application/octet-stream',
  }));
  assert.equal(applied.status, 201, JSON.stringify(applied.body));
  const apps = await seeker('GET', '/seeker/applications');
  assert.equal(apps.body.applications.length, 1);
  assert.equal(apps.body.applications[0].job.title, 'Support Engineer');
  assert.equal(apps.body.applications[0].status, 'Under review');

  // Payment: Payoneer details, then a request that waits for an admin
  const info = await seeker('GET', '/seeker/payment');
  assert.equal(info.body.payeeEmail, 'natnaelsolomon571@gmail.com');
  assert.equal(info.body.method, 'Payoneer');
  assert.equal(info.body.payment, null);
  const bad = await seeker('POST', '/seeker/payment', { payerName: 'Hana Bekele', payerEmail: 'hana@t.test' });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.fields.reference);
  const paid = await seeker('POST', '/seeker/payment', { payerName: 'Hana Bekele', payerEmail: 'hana@t.test', reference: 'PYN-12345' });
  assert.equal(paid.status, 201);
  assert.equal(paid.body.payment.status, 'pending');
  assert.equal((await seeker('POST', '/seeker/payment', { payerName: 'Hana Bekele', payerEmail: 'hana@t.test', reference: 'PYN-12345' })).status, 409);
  assert.equal((await seeker('GET', '/seeker/payment')).body.payment.status, 'pending');

  // Only admins review payments (sign-ins are rate-limited by now, so the admin session is minted directly)
  assert.equal((await rec('GET', '/payments')).status, 403);
  const { signToken } = await import('../src/middleware/auth.js');
  const admin = jarClient({ ats_token: signToken(await User.findOne({ email: 'admin@t.test' })) });
  const pending = await admin('GET', '/payments?status=pending');
  assert.equal(pending.body.pending, 1);
  assert.equal(pending.body.payments[0].seeker.email, 'hana@t.test');
  assert.equal((await admin('POST', `/payments/${paid.body.payment._id}/approve`)).status, 200);
  assert.equal((await admin('POST', `/payments/${paid.body.payment._id}/reject`)).status, 409);

  // Approved: the full report unlocks
  assert.equal((await seeker('GET', '/seeker/me')).body.seeker.premium, true);
  const full = await seeker('GET', `/seeker/checks/${checked.body.id}`);
  assert.equal(full.body.check.locked, false);
  assert.equal(full.body.check.review.suggestions[0].suggestion, 'Quantify results');
  assert.equal((await seeker('POST', '/seeker/payment', { payerName: 'Hana Bekele', payerEmail: 'hana@t.test', reference: 'PYN-2' })).status, 409);

  // Sign out and back in
  await seeker('POST', '/seeker/logout');
  assert.equal((await seeker('GET', '/seeker/me')).body.seeker, null);
  assert.equal((await seeker('GET', '/seeker/checks')).status, 401);
  assert.equal((await seeker('POST', '/seeker/login', { email: 'hana@t.test', password: 'wrong' })).status, 401);
  assert.equal((await seeker('POST', '/seeker/login', { email: 'hana@t.test', password: 'Password123!' })).status, 200);
});

test('job seeker: the upload returns before the AI review, and the score stays hidden until it is done', opts, async () => {
  let finish;
  const slow = new Promise((resolve) => (finish = resolve));
  const review = { readable: true, overallScore: 71, headline: 'Good', summary: '', detectedRole: '', seniority: 'mid', scores: Object.fromEntries(['impact', 'clarity', 'structure', 'skills', 'atsReadability'].map((k) => [k, { score: 70, comment: '' }])), strengths: [], weaknesses: [], suggestions: [], rewrites: [], sectionFeedback: [], missingKeywords: [], tips: [], injectionAttempt: false };
  const seeker = jarClient();
  await seeker('POST', '/seeker/signup', { name: 'Sami Alemu', email: 'sami@t.test', password: 'Password123!' });
  await withFakeAi(async () => {
    await slow;
    return { text: JSON.stringify(review) };
  }, async () => {
    const fd = new FormData();
    fd.append('resume', new Blob([await docx(['Experience', 'Data Analyst (2020 - Present)', 'Built dashboards in SQL', 'Skills', 'SQL'])]), 'sami.docx');
    const r = await seeker('POST', '/seeker/check', fd);
    assert.equal(r.status, 201, 'responds while the AI is still working');
    let pending;
    for (let i = 0; i < 50 && !pending; i++) {
      pending = (await seeker('GET', '/seeker/checks')).body.checks[0];
      if (!pending) await new Promise((res) => setTimeout(res, 50));
    }
    assert.equal(pending.pending, true);
    assert.equal(pending.score, null);
    finish();
    for (let i = 0; i < 50 && (await seeker('GET', '/seeker/checks')).body.checks[0].pending; i++) await new Promise((res) => setTimeout(res, 100));
  });
  const done = (await seeker('GET', '/seeker/checks')).body.checks[0];
  assert.equal(done.pending, false);
  assert.equal(done.score, 71);
});

test('ATS CV Filter: admins filter CVs by rule-based ATS checks only; others are refused', opts, async () => {
  assert.equal((await rec('GET', '/ats-cv-filter')).status, 403);
  const { signToken } = await import('../src/middleware/auth.js');
  const admin = jarClient({ ats_token: signToken(await User.findOne({ email: 'admin@t.test' })) });

  const all = await admin('GET', '/ats-cv-filter');
  assert.equal(all.status, 200);
  assert.ok(all.body.total > 0);
  const row = all.body.applications[0];
  assert.ok(Number.isInteger(row.atsScore));
  assert.ok(row.checks.some((c) => c.id === 'readable'));

  const sorted = (await admin('GET', '/ats-cv-filter?sort=ats')).body.applications.map((a) => a.atsScore);
  assert.deepEqual(sorted, [...sorted].sort((a, b) => b - a));
  for (const a of (await admin('GET', '/ats-cv-filter?minAts=75')).body.applications) assert.ok(a.atsScore >= 75);
  const { decisions, counted } = all.body;
  assert.equal(decisions.pass + decisions.review + decisions.reject, counted);
  for (const a of (await admin('GET', '/ats-cv-filter?result=reject')).body.applications) assert.equal(a.decision, 'reject');
  assert.ok(row.improvements.every((i) => i.problem && i.fix));
  for (const a of (await admin('GET', '/ats-cv-filter?mustPass=contact')).body.applications) assert.equal(a.checks.find((c) => c.id === 'contact').status, 'pass');
});

test('ATS CV Filter: an uploaded CV is checked with ATS rules only, even with AI switched on', opts, async () => {
  const { signToken } = await import('../src/middleware/auth.js');
  const admin = jarClient({ ats_token: signToken(await User.findOne({ email: 'admin@t.test' })) });
  let aiCalls = 0;
  await withFakeAi(async () => {
    aiCalls++;
    return { text: '{}' };
  }, async () => {
    const fd = new FormData();
    fd.append('resume', new Blob([await docx(['Abebe Kebede', 'abebe@t.test +251 911 234 567', 'Experience', 'Engineer (2019 - Present)', 'Cut costs by 30%', 'Education', 'BSc', 'Skills', 'React'])]), 'abebe.docx');
    const r = await admin('POST', '/ats-cv-filter/check', fd);
    assert.equal(r.status, 200);
    assert.equal(r.body.result.fileName, 'abebe.docx');
    assert.ok(r.body.result.score > 0);
    assert.equal(r.body.result.checks.find((c) => c.id === 'contact').status, 'pass');
    assert.equal((await admin('POST', '/ats-cv-filter/check', new FormData())).status, 400);
  });
  assert.equal(aiCalls, 0);
});
