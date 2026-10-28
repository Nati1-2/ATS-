import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateCv, jobKeywords, aiQualityOf, stem } from '../src/utils/atsScore.js';
import { quickChecks } from '../src/utils/cvChecker.js';
import { scoreApplication } from '../src/utils/scoring.js';

const JOB = {
  title: 'Frontend Developer',
  mustHaveSkills: ['React', 'TypeScript'],
  niceToHaveSkills: ['GraphQL'],
  minYearsExperience: 3,
  minEducation: 'bachelor',
  description: 'We are hiring a frontend developer to build React applications with TypeScript. You will build accessible user interfaces, write unit tests, and work with REST APIs.',
  requirements: '3+ years building React applications. Experience with unit tests and REST APIs.',
};

const STRONG = `Abebe Kebede
abebe@mail.com | +251 911 234 567
Summary
Frontend developer building accessible React applications with TypeScript.
Experience
Frontend Developer, Acme (Jan 2019 - Present)
- Built React applications in TypeScript used by 20,000 users
- Cut page load time by 40% with accessible user interfaces
- Wrote unit tests, raising coverage to 85%
- Integrated REST APIs and GraphQL for 5 product teams
Education
BSc Computer Science, Addis Ababa University (2014 - 2018)
Skills
React, TypeScript, GraphQL, Jest`;

test('job keywords: repeated phrases first, no filler words, no phrases across sentences', () => {
  const k = jobKeywords(JOB);
  assert.ok(k.includes('react applications'));
  assert.ok(k.includes('rest apis'));
  assert.ok(!k.includes('experience'));
  assert.ok(!k.some((t) => t === 'typescript you'));
});

test('a strong CV for the job is a strong match, weighted mostly on the job', () => {
  const r = rateCv(STRONG, JOB, { fileName: 'abebe.docx' });
  assert.ok(r.score >= 80, `score ${r.score}`);
  assert.equal(r.grade, 'Strong match');
  assert.deepEqual(r.components.map((c) => c.key), ['requirements', 'keywords', 'parse', 'content']);
  assert.equal(r.components.reduce((t, c) => t + c.weight, 0), 100);
  assert.deepEqual(r.knockouts, []);
});

test('missing a must-have skill is a knockout that caps the score', () => {
  const r = rateCv(STRONG.replace(/TypeScript/g, 'Sass'), JOB, { fileName: 'abebe.docx' });
  assert.ok(r.score <= 65, `score ${r.score}`);
  assert.match(r.knockouts[0], /TypeScript/);
});

test('an unreadable CV scores 0, and an odd file format costs points', () => {
  assert.equal(rateCv('', JOB).score, 0);
  const docx = rateCv(STRONG, null, { fileName: 'cv.docx' });
  const odd = rateCv(STRONG, null, { fileName: 'cv.pages' });
  assert.ok(odd.score < docx.score);
  assert.equal(odd.checks.find((c) => c.id === 'format').status, 'fail');
});

test('without a job only parseability and content are rated', () => {
  const r = rateCv(STRONG, null);
  assert.deepEqual(r.components.map((c) => [c.key, c.weight]), [['parse', 60], ['content', 40]]);
  assert.equal(r.keywords, undefined);
});

test('ATS decision: strong CVs pass, knockouts are rejected', () => {
  assert.equal(rateCv(STRONG, JOB, { fileName: 'cv.docx' }).decision, 'pass');
  assert.equal(rateCv(STRONG.replace(/TypeScript/g, 'Sass'), JOB, { fileName: 'cv.docx' }).decision, 'reject');
  assert.equal(rateCv('', JOB).decision, 'reject');
});

test('weaknesses are ranked knockouts first, then by points, each with a fix', () => {
  const r = rateCv('Sara\nExperience\nI was responsible for various tasks on the website.\nSkills\nPython', JOB, { fileName: 'cv.doc' });
  assert.equal(r.improvements[0].id, 'must');
  assert.equal(r.improvements[0].knockout, true);
  assert.match(r.improvements[0].problem, /React, TypeScript/);
  const rest = r.improvements.slice(1).map((i) => i.gain);
  assert.deepEqual(rest, [...rest].sort((a, b) => b - a));
  for (const i of r.improvements) assert.ok(i.fix && i.gain >= 1, i.id);
  assert.ok(r.improvements.some((i) => i.id === 'contact'));
  assert.ok(r.improvements.some((i) => i.id === 'jobKeywords'));
  assert.equal(rateCv('', JOB).improvements[0].id, 'readable');
});

test('without a job, role keywords from the AI are matched word for word and missing ones are a fix', () => {
  const r = rateCv(STRONG, null, { roleKeywords: ['React', 'TypeScript', 'Redux', 'Webpack'] });
  const k = r.components.find((c) => c.key === 'keywords');
  assert.equal(k.score, 50);
  assert.deepEqual(r.keywords, { source: 'role', found: ['react', 'typescript'], missing: ['redux', 'webpack'] });
  assert.ok(r.improvements.some((i) => i.id === 'jobKeywords' && /for this role/.test(i.problem)));
  assert.equal(r.components.reduce((t, c) => t + c.weight, 0), 100);
});

test('the AI writing-quality score counts for 30%, and a knockout still caps the total', () => {
  const rules = rateCv(STRONG, null);
  const withAi = rateCv(STRONG, null, { aiQuality: 40 });
  assert.equal(withAi.components.find((c) => c.key === 'quality').weight, 30);
  assert.equal(withAi.score, Math.round(rules.score * 0.7 + 40 * 0.3));
  const knockout = rateCv(STRONG, { ...JOB, mustHaveSkills: ['Rust'] }, { aiQuality: 100 });
  assert.ok(knockout.score <= 65);
  assert.equal(knockout.decision, 'reject');
});

test('AI quality: mean of impact, clarity and skills; none for an unreadable review', () => {
  assert.equal(aiQualityOf({ readable: true, scores: { impact: { score: 50 }, clarity: { score: 70 }, skills: { score: 90 }, structure: { score: 0 } } }), 70);
  assert.equal(aiQualityOf({ readable: false, scores: {} }), null);
  assert.equal(aiQualityOf(null), null);
});

const ANALYST = {
  title: 'Data Analyst',
  mustHaveSkills: ['SQL', 'Power BI'],
  minYearsExperience: 2,
  description: 'We need a data analyst to build dashboards and reports. You will analyze data, write SQL queries, and share insights with stakeholders. Experience with data visualization and dashboards in Power BI.',
  requirements: '2+ years of data analysis. Strong SQL queries. Data visualization. Stakeholder management.',
};

test('job keywords: word forms merged, listed skills and their fragments left out, no filler', () => {
  const k = jobKeywords(ANALYST);
  assert.ok(k.includes('sql queries') && k.includes('dashboards'));
  assert.equal(k.filter((t) => /^stakeholders?$/.test(t)).length, 1);
  for (const t of ['power', 'sql', 'need']) assert.ok(!k.includes(t), t);
  assert.ok(!k.includes('insights'), 'a word the ad says once is not a keyword');
});

test('job keywords: a short ad gives too few terms to score, and "front-end" is one word', () => {
  const job = { title: 'Backend Engineer', mustHaveSkills: ['Node.js'], description: 'Own services end to end, from design through production monitoring for thousands of fleets.' };
  assert.deepEqual(jobKeywords(job), ['backend', 'engineer']);
  assert.ok(!rateCv(STRONG, job).components.some((c) => c.key === 'keywords'));
  assert.ok(jobKeywords({ title: 'Front-end Developer', description: 'Front-end work.' }).includes('frontend'));
});

test('keywords match other forms of the same word, as in a real ATS, but not other words', () => {
  const cv = 'Experience\n- Wrote a SQL query library and built a dashboard for each stakeholder';
  const r = rateCv(cv, ANALYST);
  for (const t of ['sql queries', 'dashboards', 'stakeholder']) assert.ok(r.keywords.found.includes(t), t);
  assert.ok(r.keywords.missing.includes('data visualization'));
  assert.equal(stem('planned'), stem('planning'));
  assert.equal(stem('organisation'), stem('organize'));
  assert.equal(stem('node.js'), 'node.js');
});

test('a range of years is not a phone number', () => {
  const contact = (t) => quickChecks(t).checks.find((c) => c.id === 'contact').status;
  assert.equal(contact('sara@mail.com\nExperience\nAccountant (2014 - 2018)\n2019 - 2021'), 'warn');
  assert.equal(contact('sara@mail.com\n0911 234 567'), 'pass');
  assert.equal(contact('sara@mail.com\n+1 (555) 123-4567'), 'pass');
});

test('versions, codes and dates are not measurable results; real numbers are', () => {
  const impact = (lines) => quickChecks(`Experience\n${lines.join('\n')}`).stats.quantifiedLines;
  assert.equal(impact(['Used Windows 10 and Python 3.11', 'Worked to ISO 9001', 'Q3 planning in HTML5', 'Analyst | 2021/03 – Present', 'Ranked 1st']), 0);
  assert.equal(impact(['- Built 12 dashboards', 'Cut costs by 20%', 'Managed a $2M budget', 'Upgraded to React 18 for 30,000 users']), 4);
});

test('year-first dates such as "2021/03 – Present" count towards experience', () => {
  const cv = 'Experience\nData Analyst | 2021/03 – 2024/03\nAnalyst | 2019-01 – 2021-01';
  assert.equal(scoreApplication(ANALYST, { resumeText: cv }).yearsExperience, 5);
});

test('the shown weights always add up to 100', () => {
  const job = { title: 'Backend Engineer', description: 'Build and run the APIs behind our platform.', mustHaveSkills: ['Node.js'], minYearsExperience: 3 };
  for (const aiQuality of [null, 60]) {
    for (const j of [null, job]) assert.equal(rateCv(STRONG, j, { aiQuality }).components.reduce((t, c) => t + c.weight, 0), 100);
  }
});

const POOR = `Sara
sara123@gmail.com
Objective
I am a hard working person looking for a job in a good company where I can grow.
Experience
Worked at a shop. Responsible for various tasks such as helping customers and cleaning etc.
Helped with the computer stuff sometimes.
Education
Grade 12
Skills
MS Office, communication`;

test('calibration: a very poor CV is rejected by the rules alone, a strong one passes', () => {
  const poor = rateCv(POOR, null, { fileName: 'cv.docx' });
  assert.ok(poor.score < 50, `poor ${poor.score}`);
  assert.equal(poor.decision, 'reject');
  for (const id of ['length', 'dates', 'depth', 'verbs', 'impact']) assert.equal(poor.checks.find((c) => c.id === id).status, 'fail', id);
  const strong = rateCv(STRONG, null, { fileName: 'cv.docx' });
  assert.ok(strong.score >= 80, `strong ${strong.score}`);
});

test('role keywords: only the AI\'s top 10 count, and known synonyms match', () => {
  const kw = ['React', 'TypeScript', 'REST API', 'JavaScript', 'Jest', 'GraphQL', 'Git', 'Next.js', 'CSS', 'HTML', 'Webpack', 'Redux'];
  const r = rateCv(`${STRONG}\nUsed JS and RESTful services daily`, null, { roleKeywords: kw });
  assert.equal(r.keywords.found.length + r.keywords.missing.length, 10);
  assert.ok(r.keywords.found.includes('rest api') && r.keywords.found.includes('javascript'));
});

test('a high-scoring stub CV is held for review, with the reason', () => {
  const stub = 'Yonas\nyonas@mail.com\nSummary\nBackend engineer.\nExperience\nBackend Engineer, Acme (Jan 2019 - Present)\nWork with Node.js, MongoDB, REST.\nEducation\nBSc Computer Engineering\nSkills\nNode.js, MongoDB, REST';
  const r = rateCv(stub, { title: 'Backend Engineer', mustHaveSkills: ['Node.js', 'MongoDB', 'REST'], minYearsExperience: 3 }, { fileName: 'cv.pdf' });
  assert.ok(r.score >= 75, `score ${r.score}`);
  assert.equal(r.decision, 'review');
  assert.match(r.holds[0], /Too little detail/);
  assert.deepEqual(rateCv(STRONG, JOB, { fileName: 'cv.docx' }).holds, []);
});

test('real-world parsing: BA / BBA / LLB degrees, accounting and customer-service synonyms', () => {
  const acc = { title: 'Accountant', mustHaveSkills: ['Financial reporting', 'Customer service'], minEducation: 'bachelor' };
  const r = rateCv('Experience\nAccountant (Jan 2020 - Present)\n- Prepared monthly profit and loss statements\n- Served customers at the front desk, about 50 a day\nEducation\nBA Accounting and Finance', acc);
  assert.deepEqual(r.jobMatch.missingMustHave, []);
  assert.ok(!r.holds.some((h) => /education/.test(h)), r.holds.join());
});

test('a long skills list with nothing about the work is a knockout; below the minimum years is held for review', () => {
  const skills = Array.from({ length: 30 }, (_, i) => `Skill${i}`).join(', ');
  const stuffed = rateCv(`Yared\nyared@mail.com\nSkills\nSQL, Excel, ${skills}\nExperience\nData analyst`, { title: 'Data Analyst', mustHaveSkills: ['SQL', 'Excel'] });
  assert.equal(stuffed.decision, 'reject');
  assert.match(stuffed.knockouts.join(), /without evidence of the work/);
  const junior = rateCv(STRONG, { ...JOB, minYearsExperience: 12 }, { fileName: 'cv.docx' });
  assert.equal(junior.decision, 'review');
  assert.match(junior.holds.join(), /Below the required experience/);
});
