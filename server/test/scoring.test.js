import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreApplication, splitSections, estimateYears, detectEducation, matchTitle, skillAliases } from '../src/utils/scoring.js';

const NOW = new Date('2026-10-01');
const job = {
  title: 'Senior Frontend Engineer',
  mustHaveSkills: ['React', 'TypeScript', 'CSS'],
  niceToHaveSkills: ['Next.js', 'Accessibility'],
  minYearsExperience: 5,
  minEducation: 'bachelor',
};
const strongCv = `Liya Tesfaye
Frontend Developer · liya@example.com

Summary
Frontend developer focused on accessible web apps.

Experience
Senior Frontend Developer, Kifiya — Jan 2020 – Present
Built a design system in React and TypeScript; owned CSS architecture.
Frontend Developer, Gebeya — 03/2017 - 12/2019
Shipped Next.js marketing sites with WCAG 2.1 accessibility.

Education
BSc Computer Science, Addis Ababa University, 2013 – 2017

Skills
React, TypeScript, CSS, Next.js`;

test('synonyms: K8s counts as Kubernetes, JS as JavaScript', () => {
  assert.ok(skillAliases('Kubernetes').includes('k8s'));
  const r = scoreApplication({ title: 'DevOps', mustHaveSkills: ['Kubernetes', 'JavaScript'] }, { resumeText: 'Experience\nRan K8s clusters, wrote JS tooling 2019 - 2024' }, NOW);
  assert.deepEqual(r.missingMustHave, []);
});

test('whole words only: Java does not match JavaScript', () => {
  const r = scoreApplication({ title: 'x', mustHaveSkills: ['Java'] }, { resumeText: 'Skills\nJavaScript, TypeScript' }, NOW);
  assert.deepEqual(r.missingMustHave, ['Java']);
});

test('sections are detected, including "Skills: a, b" lines', () => {
  const { sections, structured } = splitSections('Jane\nSkills: React, CSS\nWork Experience\nDev at X');
  assert.ok(structured);
  assert.deepEqual(sections.skills, ['React, CSS']);
  assert.deepEqual(sections.experience, ['Dev at X']);
});

test('years: merges overlapping ranges, handles Present and numeric months, ignores education dates', () => {
  const { sections, structured } = splitSections(strongCv);
  const { years, source } = estimateYears(sections, structured, NOW);
  assert.equal(source, 'dates');
  // 03/2017–12/2019 (33 months) + Jan 2020–Oct 2026 (81 months) = 114 months = 9.5 years
  assert.equal(years, 9.5);
});

test('years: falls back to a stated "N years of experience"', () => {
  const { sections, structured } = splitSections('Summary\nDesigner with 6+ years of experience in product design.');
  assert.deepEqual(estimateYears(sections, structured, NOW), { years: 6, source: 'stated' });
});

test('education: finds the highest degree and ignores "Scrum Master"', () => {
  const s1 = splitSections('Education\nMSc Data Science\nBSc Statistics');
  assert.equal(detectEducation(s1.sections, s1.structured).level, 'master');
  const s2 = splitSections('Certifications\nCertified Scrum Master');
  assert.equal(detectEducation(s2.sections, s2.structured), null);
});

test('title: developer ≈ engineer, seniority words ignored', () => {
  const { sections, structured } = splitSections(strongCv);
  assert.equal(matchTitle('Senior Frontend Engineer', sections, structured).score, 100);
});

test('strong CV scores high with a full breakdown', () => {
  const r = scoreApplication(job, { resumeText: strongCv }, NOW);
  assert.ok(r.score >= 90, `score ${r.score}`);
  assert.deepEqual(r.components.map((c) => c.key), ['must', 'nice', 'experience', 'title', 'education']);
  assert.equal(r.skills.find((s) => s.skill === 'React').evidence, 'experience');
  assert.equal(r.skills.find((s) => s.skill === 'Accessibility').found, true); // via "WCAG"
  assert.equal(r.flags.length, 0);
});

test('"want to learn React" earns little credit', () => {
  const r = scoreApplication({ title: 'Frontend', mustHaveSkills: ['React'] }, { resumeText: 'Summary\nBackend dev. I want to learn React next year.' }, NOW);
  const react = r.skills[0];
  assert.equal(react.evidence, 'aspirational');
  assert.deepEqual(r.missingMustHave, ['React']);
});

test('keyword stuffing: repeats count once and are flagged', () => {
  const stuffed = `Skills\n${'React TypeScript CSS Next.js Accessibility '.repeat(15)}`;
  const r = scoreApplication(job, { resumeText: stuffed }, NOW);
  assert.ok(r.flags.some((f) => f.includes('repeated')), r.flags.join());
  const honest = scoreApplication(job, { resumeText: strongCv }, NOW);
  assert.ok(r.score < honest.score - 30, `stuffed ${r.score} vs honest ${honest.score}`);
});

test('cover letter counts, but less than the CV', () => {
  const r = scoreApplication({ title: 'x', mustHaveSkills: ['Figma'] }, { resumeText: 'Experience\nDesigner 2020 - 2024', coverLetter: 'I use Figma daily.' }, NOW);
  assert.equal(r.skills[0].evidence, 'cover_letter');
  assert.equal(r.skills[0].credit, 0.7);
});

test('job with no criteria has no score', () => {
  assert.equal(scoreApplication({ title: 'x' }, { resumeText: 'anything' }), null);
});

test('a short honest CV is not flagged as stuffing', () => {
  const short = 'Abebe\nExperience\nFrontend Developer at Zemen Bank, 2019 - 2024. Built React and TypeScript apps.\nSkills\nReact, TypeScript, CSS, Next.js, Accessibility';
  assert.deepEqual(scoreApplication(job, { resumeText: short }, NOW).flags, []);
});

test('a bare keyword list is flagged', () => {
  const list = 'Skills\nReact, TypeScript, CSS, Next.js, Accessibility, Docker, AWS';
  assert.ok(scoreApplication(job, { resumeText: list }, NOW).flags.includes('Very little detail beyond a list of keywords'));
});

test('title: the specialty matters more than the generic role word', () => {
  const s = splitSections('Experience\nJunior Web Developer, Andela (2022 - Present)');
  assert.equal(matchTitle('Senior Frontend Engineer', s.sections, s.structured).score, 40);
  const t = splitSections('Experience\nFrontend Developer, Kakao (2020 - Present)');
  assert.equal(matchTitle('Senior Frontend Engineer', t.sections, t.structured).score, 100);
});

test('messy layout: Experience heading not detected → dates and titles still found', () => {
  // As extracted from a two-column table CV: the heading is glued to another cell's text
  const text = 'Meron Assefa\nSkills\nReact\nTypeScript\nNext.js Experience\nSenior Frontend Developer, Kifiya (2020-2025)\nEducation: BSc Computer Science, Addis Ababa University (2015-2019)';
  const r = scoreApplication({ title: 'Frontend Engineer', mustHaveSkills: ['React'], minYearsExperience: 3 }, { resumeText: text }, NOW);
  assert.equal(r.yearsExperience, 5); // 2020–2025, education dates ignored
  assert.equal(r.titleMatch.score, 100);
});

// Layouts recreated from real-world formats (text as extracted from their PDFs)
test('Europass: "EDUCATION AND TRAINING" heading, dd/mm/yyyy dates, job at a university', () => {
  const text = [
    'Liya Haile', 'WORK EXPERIENCE',
    '01/09/2020 – CURRENT – Addis Ababa, Ethiopia', 'FRONT END DEVELOPER – ETHIO TELECOM',
    '• Developed customer self-service portal (ReactJS, TS)',
    '15/06/2018 – 31/08/2020 – Adama, Ethiopia', 'WEB DEVELOPER – ADAMA SCIENCE AND TECHNOLOGY UNIVERSITY',
    'EDUCATION AND TRAINING', '2013 – 2017 – Adama, Ethiopia', 'BACHELOR OF SCIENCE IN SOFTWARE ENGINEERING',
    'DIGITAL SKILLS', 'React | TypeScript | HTML5 / CSS3',
  ].join('\n');
  const r = scoreApplication({ title: 'Frontend Engineer', mustHaveSkills: ['React', 'TypeScript'] }, { resumeText: text }, new Date('2026-10-19'));
  assert.equal(r.yearsExperience, 8.3); // 26 + 73 months; university years excluded, university *job* included
  assert.equal(r.education.level, 'bachelor');
  assert.deepEqual(r.missingMustHave, []);
});

test('LinkedIn export: "January 2022 - Present (2 years 10 months)" and Top Skills', () => {
  const text = [
    'Contact', 'abebe.k@gmail.com', 'Top Skills', 'React.js', 'TypeScript', 'Abebe Kebede',
    'Experience', 'Chapa', 'Senior Software Engineer', 'January 2022 - Present (2 years 10 months)',
    'Gebeya Inc.', 'Software Engineer', 'August 2019 - December 2021 (2 years 5 months)',
    'Education', 'Addis Ababa University', 'Bachelor of Science - BS, Computer Science · (2014 - 2019)',
  ].join('\n');
  const r = scoreApplication({ title: 'Software Engineer', mustHaveSkills: ['React'], minEducation: 'bachelor' }, { resumeText: text }, new Date('2026-10-19'));
  assert.equal(r.yearsExperience, 7.1);
  assert.equal(r.titleMatch.score, 100);
  assert.equal(r.components.find((c) => c.key === 'education').score, 100);
});
