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

test('CV checker: upload is reviewed (fake AI), saved to your history, and the file is not kept', opts, async () => {
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
    assert.equal(r.body.check.aiStatus, 'done');
    assert.equal(r.body.check.review.overallScore, 64);
    assert.equal(r.body.check.jobTitle, 'Backend Engineer');
    assert.ok(r.body.check.quick.checks.some((c) => c.id === 'keywords'));
    assert.equal(fs.readdirSync(path.join(process.env.UPLOAD_DIR, 'resumes')).length, before);

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
