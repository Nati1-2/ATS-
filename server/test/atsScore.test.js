import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateCv, jobKeywords } from '../src/utils/atsScore.js';

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
