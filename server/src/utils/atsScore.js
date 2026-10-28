/**
 * ATS rating: scores a CV the way commercial applicant tracking systems and resume scanners do, with rules only (no AI).
 *
 * With a job, most of the score is how well the CV matches it, as in a real ATS:
 * - Requirements match (45%): must-have / nice-to-have skills, years of experience, job title, education (utils/scoring.js)
 * - Job description keywords (15%): the terms the job ad repeats most, found word-for-word in the CV
 * - Parseability (25%): can a parser read the file, find contact details, standard headings and dates
 * - Content (15%): measurable results, action verbs, summary, skimmable bullets
 * Without a job only parseability (60%) and content (40%) are rated, plus (when the AI review has suggested them)
 * the keywords an ATS would search for in the target role, matched word-for-word like the job ad's.
 * After the AI review, its writing-quality score (impact, clarity, skills) counts for 30% (AI_SHARE): rules can't
 * judge how convincing a bullet is, and the AI alone is not consistent enough to be the whole score.
 *
 * Knockouts work like ATS screening filters: an unreadable CV scores 0 and a missing must-have skill caps the score.
 * Each CV gets an ATS decision (pass / review / reject) and a ranked list of weaknesses with how to fix them.
 */
import path from 'node:path';
import { quickChecks } from './cvChecker.js';
import { scoreApplication, skillAliases } from './scoring.js';
import { TOKEN, segments, stem, stemIndex, hasTerm } from './keywords.js';

export { stem };

const WEIGHTS_WITH_JOB = { requirements: 45, keywords: 15, parse: 25, content: 15 };
const WEIGHTS_NO_JOB = { parse: 60, content: 40 };
const WEIGHTS_ROLE = { keywords: 25, parse: 45, content: 30 };
const MISSING_MUST_HAVE_CAP = 65;
const KEYWORD_COUNT = 20;
const AI_SHARE = 0.3;

export const ATS_GRADES = [
  { min: 80, label: 'Strong match' },
  { min: 65, label: 'Good match' },
  { min: 50, label: 'Fair match' },
  { min: 0, label: 'Low match' },
];

// Sub-weights inside each rule-based category. quickChecks only reports some checks when they fail, so absent = pass.
const PARSE = { contact: 30, sections: 30, dates: 20, length: 10, format: 10 };
const CONTENT = { impact: 40, verbs: 25, summary: 15, bullets: 10, pronouns: 5, personal: 5 };
const POINTS = { pass: 1, warn: 0.5, fail: 0 };

// Files ATS parsers read reliably, best first
const FORMATS = { '.docx': 'pass', '.pdf': 'pass', '.doc': 'warn', '.odt': 'warn', '.rtf': 'warn', '.txt': 'warn' };
// Icons, emoji and box-drawing characters usually come from templates with graphics or tables that parsers garble
const SYMBOLS = /[─-➿⬀-⯿\u{1F000}-\u{1FAFF}-]/gu;

const STOP = new Set(`a about above across after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each either etc few for from further had has have having he her here hers him his how i if in into is it its itself just may me might more most must my no nor not now of off on once only or other our ours out over own per please same shall she should so some such than that the their theirs them then there these they this those through to too under until up upon us very via was we were what when where which while who whom why will with within without would yet you your yours
ability able access build building built write writing use used matter plus across activities additional apply applicant applicants based benefits best candidate candidates closely company competitive create culture daily day degree demonstrated description desired environment equal excellent experience experienced expected focus following fast full good great growth help highly hire hiring ideal include including job join key knowledge least level looking make new offer opportunity opportunities paced plus position preferred proven related required requirement requirements responsibilities responsible role salary skills solid strong successful support team teams time understanding using well work working world year years need needs seeking ideally want ensure other minimum`.split(/\s+/));

/**
 * The terms a job ad repeats most (repeated two-word phrases, then single words), like the keyword list of a
 * resume scanner. Word forms are merged ("dashboard" / "dashboards"). Skills the job lists are already rated
 * in the requirements match, so neither they nor their fragments ("power" of "Power BI") are repeated here.
 */
export function jobKeywords(job, limit = KEYWORD_COUNT) {
  const skillTerms = [...(job.mustHaveSkills || []), ...(job.niceToHaveSkills || [])].flatMap(skillAliases);
  const skip = new Set(skillTerms.flatMap((t) => (t.match(TOKEN) || []).map(stem)));
  const words = new Map();
  const phrases = new Map();
  // Counted by stem; shown in the form the ad uses most
  const bump = (map, key, form) => {
    const e = map.get(key) ?? { n: 0, forms: new Map() };
    e.n += 1;
    e.forms.set(form, (e.forms.get(form) || 0) + 1);
    map.set(key, e);
  };
  const form = (e) => [...e.forms.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  for (const segment of segments([job.title, job.description, job.requirements].filter(Boolean).join('\n'))) {
    const tokens = (segment.match(TOKEN) || []).map((w) => (STOP.has(w) || (w.length < 3 && !/[+#]/.test(w)) ? null : w));
    tokens.forEach((w, i) => {
      if (!w) return;
      if (!skip.has(stem(w))) bump(words, stem(w), w);
      const next = tokens[i + 1];
      if (next) bump(phrases, `${stem(w)} ${stem(next)}`, `${w} ${next}`);
    });
  }
  const byCount = (map) => [...map.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
  const isSkill = (key) => key.split(' ').every((w) => skip.has(w));
  const picked = byCount(phrases).filter(([key, e]) => e.n >= 2 && !isSkill(key));
  const inPhrase = new Set(picked.flatMap(([key]) => key.split(' ')));
  const single = byCount(words).filter(([key]) => !inPhrase.has(key));
  return [...picked, ...single].map(([, e]) => form(e)).slice(0, limit);
}

const weighted = (weights, statusOf) => {
  const total = Object.values(weights).reduce((t, w) => t + w, 0);
  return Math.round((Object.entries(weights).reduce((t, [id, w]) => t + w * POINTS[statusOf(id)], 0) / total) * 100);
};

export const atsGrade = (score) => ATS_GRADES.find((g) => score >= g.min).label;

// Like an ATS screening stage: knockouts and low scores are rejected, strong CVs pass, the rest wait for a recruiter
const PASS_AT = 75;
const REJECT_BELOW = 50;
export const ATS_DECISIONS = { pass: 'Passed', review: 'Needs review', reject: 'Rejected' };
const decide = (score, knockouts) => (knockouts.length || score < REJECT_BELOW ? 'reject' : score >= PASS_AT ? 'pass' : 'review');

// How to fix each rule-based check
const FIXES = {
  contact: 'Put your email and phone number as plain text at the top of page 1, not in a header, footer or image.',
  sections: 'Use plain headings an ATS recognises: Summary, Experience, Education, Skills.',
  dates: 'Give every role a date range such as "Jan 2021 – Present" next to the job title.',
  length: 'Aim for 400–900 words (1–2 pages): add detail about results, or cut old and unrelated roles.',
  format: 'Save the CV as DOCX or a text-based PDF (exported from Word or Google Docs, not scanned).',
  symbols: 'Use a simple one-column layout without icons, tables, text boxes or graphics.',
  impact: 'Rewrite at least 3 bullets to show a result with a number, e.g. "Reduced costs by 20%" or "Served 10,000 users".',
  verbs: 'Start each bullet with an action verb (Led, Built, Reduced, Launched) instead of "responsible for" or "helped with".',
  summary: 'Add a 2–3 line summary at the top with your target job title, years of experience and top skills.',
  bullets: 'Split long paragraphs into bullet points of one or two lines.',
  pronouns: 'Leave out "I", "my" and "me" in bullet points.',
  personal: 'Remove date of birth, marital status, religion, nationality and similar personal details.',
  injection: 'Remove any text addressed to AI or screening systems, including hidden white or tiny text. It is found and treated as dishonest.',
};
const AREA = { parse: 'Parseability', content: 'Content' };

/** The AI review's writing-quality score (0-100), or null when there is no usable review. */
export function aiQualityOf(review) {
  if (!review || review.readable === false || !review.scores) return null;
  const parts = ['impact', 'clarity', 'skills'].map((k) => review.scores[k]?.score).filter((n) => Number.isFinite(n));
  return parts.length ? Math.round(parts.reduce((t, n) => t + n, 0) / parts.length) : null;
}

/** Weaknesses ranked by how many points fixing them would add (knockouts first). */
function findImprovements({ checks, components, match, keywords, job, knockouts, status }) {
  const list = [];
  const weightOf = (key) => components.find((c) => c.key === key)?.weight ?? 0;
  const total = components.reduce((t, c) => t + c.weight, 0) || 1;

  for (const [key, subs] of [['parse', components.find((c) => c.key === 'parse')?.subWeights], ['content', CONTENT]]) {
    if (!subs) continue;
    const subTotal = Object.values(subs).reduce((t, w) => t + w, 0);
    for (const [id, w] of Object.entries(subs)) {
      const c = checks.find((x) => x.id === id);
      if (!c || c.status === 'pass') continue;
      list.push({ id, area: AREA[key], severity: c.status === 'fail' ? 'high' : 'medium', problem: c.detail, fix: FIXES[id], gain: ((weightOf(key) / total) * (w / subTotal) * (1 - POINTS[status(id)])) * 100 });
    }
  }

  if (match) {
    const reqShare = weightOf('requirements') / total;
    const subTotal = match.components.reduce((t, c) => t + c.weight, 0);
    const gainOf = (c) => reqShare * (c.weight / subTotal) * (100 - c.score);
    const listedOnly = (required) => match.skills.filter((sk) => sk.required === required && sk.found && sk.credit < 1).map((sk) => sk.skill);
    for (const c of match.components) {
      if (c.score >= 100) continue;
      const item = { id: c.key, area: 'Requirements', severity: 'medium', gain: gainOf(c) };
      if (c.key === 'must' || c.key === 'nice') {
        const missing = c.key === 'must' ? match.missingMustHave : match.missingNiceToHave;
        const weak = listedOnly(c.key === 'must');
        item.problem = missing.length
          ? `${c.key === 'must' ? 'Required' : 'Nice-to-have'} skills not found: ${missing.join(', ')}.`
          : `Skills only listed, not shown in your experience: ${weak.join(', ')}.`;
        item.fix = 'If you have these skills, use the exact words from the job ad inside your Experience bullets, e.g. "Built the checkout in React", not only in the Skills list.';
        if (c.key === 'must' && missing.length) Object.assign(item, { severity: 'high', knockout: true });
      } else if (c.key === 'experience') {
        item.problem = `Experience: ${c.detail}.`;
        item.fix = 'Add a date range to every role so the ATS can count your years, and include relevant internships, freelance or volunteer work.';
      } else if (c.key === 'title') {
        item.problem = `Your CV does not use a job title close to "${job.title}".`;
        item.fix = `Use "${job.title}" (or the closest honest title) in your summary and, if accurate, your most recent role.`;
      } else if (c.key === 'education') {
        item.problem = `Education: ${c.detail}.`;
        item.fix = 'List your highest degree under an "Education" heading with the degree spelled out, e.g. "Bachelor of Science in Computer Science".';
        if (c.score === 0) item.severity = 'high';
      } else continue;
      list.push(item);
    }
  }

  if (keywords?.missing.length) {
    const n = keywords.found.length + keywords.missing.length;
    list.push({
      id: 'jobKeywords',
      area: 'Keywords',
      severity: keywords.missing.length > n / 2 ? 'high' : 'medium',
      problem: `${keywords.missing.length} of ${n} top keywords ${keywords.source === 'role' ? 'for this role' : 'from the job ad'} are missing: ${keywords.missing.join(', ')}.`,
      fix: 'Use these words where they truly apply. ATSs match word forms ("dashboard" and "dashboards"), but not synonyms or abbreviations, so "REST APIs" and "APIs" count as different terms.',
      gain: (weightOf('keywords') / total) * (keywords.missing.length / n) * 100,
    });
  }

  if (knockouts.length) for (const i of list) if (i.knockout) i.problem += ` This is a knockout: the score is capped at ${MISSING_MUST_HAVE_CAP}% and an ATS would reject the CV.`;
  return list
    .map((i) => ({ ...i, gain: Math.max(1, Math.round(i.gain)) }))
    .sort((a, b) => Number(Boolean(b.knockout)) - Number(Boolean(a.knockout)) || b.gain - a.gain);
}

/**
 * Rate a CV. `fileName` (optional) lets the file format count. Without a job, `roleKeywords` (from the AI review)
 * are matched like a job ad's keywords; `aiQuality` (aiQualityOf) adds the AI's writing-quality score. Returns
 * { score, grade, decision, components: [{ key, label, weight (% of the score), score, detail }], knockouts, improvements, checks, keywords?, jobMatch? }.
 */
export function rateCv(text, job = null, { fileName, roleKeywords, aiQuality: aiScore = null } = {}) {
  const quick = quickChecks(text, job);
  const checks = [...quick.checks];
  const status = (id) => checks.find((c) => c.id === id)?.status ?? 'pass';
  // Hidden instructions may have swayed the AI, so its score is left out, and the CV always goes to a person
  const manipulated = status('injection') === 'fail';
  const aiQuality = manipulated ? null : aiScore;

  const ext = fileName ? path.extname(fileName).toLowerCase() : null;
  if (ext) {
    const s = FORMATS[ext] ?? 'fail';
    checks.push({ id: 'format', label: 'File format', status: s, detail: s === 'pass' ? `${ext.slice(1).toUpperCase()} is read reliably by ATSs.` : `Many ATSs read DOCX or text-based PDF best; ${ext.slice(1).toUpperCase()} may lose formatting or text.` });
  }
  const symbols = (String(text || '').match(SYMBOLS) || []).length;
  if (symbols > 5) checks.push({ id: 'symbols', label: 'Plain formatting', status: 'warn', detail: `${symbols} icons or special symbols found. Templates with icons, tables or columns are often garbled by ATS parsers.` });

  if (status('readable') === 'fail') {
    const improvements = [{ id: 'readable', area: 'Parseability', severity: 'high', knockout: true, gain: 100, problem: 'No text could be read, so an ATS sees an empty CV and rejects it.', fix: 'Export the CV from Word or Google Docs as DOCX or PDF. Do not scan or photograph it, and do not save it as an image.' }];
    return { score: 0, grade: atsGrade(0), decision: 'reject', components: [], knockouts: ['The CV text cannot be read, so an ATS would see an empty CV.'], improvements, checks };
  }

  const parseWeights = { ...PARSE, ...(symbols > 5 ? { symbols: 5 } : {}) };
  const components = [
    { key: 'parse', label: 'Parseability', score: weighted(parseWeights, status), subWeights: parseWeights, detail: 'Contact details, standard headings, dates, length and file format' },
    { key: 'content', label: 'Content', score: weighted(CONTENT, status), detail: 'Measurable results, action verbs, summary and skimmable bullets' },
  ];
  const knockouts = [];
  let keywords;
  let match = null;

  if (job) {
    match = scoreApplication(job, { resumeText: text });
    const terms = jobKeywords(job);
    if (match) components.unshift({ key: 'requirements', label: 'Requirements match', score: match.score, detail: match.components.map((c) => `${c.label}: ${c.detail}`).join(' · ') });
    if (terms.length) {
      const index = stemIndex(text);
      const found = terms.filter((t) => hasTerm(index, t));
      keywords = { source: 'job', found, missing: terms.filter((t) => !found.includes(t)) };
      components.splice(match ? 1 : 0, 0, { key: 'keywords', label: 'Job description keywords', score: Math.round((found.length / terms.length) * 100), detail: `${found.length} of ${terms.length} top keywords from the job ad found` });
    }
    if (match?.missingMustHave.length) knockouts.push(`Missing required skills: ${match.missingMustHave.join(', ')}`);
  } else if (roleKeywords?.length) {
    const terms = [...new Set(roleKeywords.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, KEYWORD_COUNT);
    const index = stemIndex(text);
    const found = terms.filter((t) => hasTerm(index, t));
    keywords = { source: 'role', found, missing: terms.filter((t) => !found.includes(t)) };
    components.unshift({ key: 'keywords', label: 'Role keywords', score: Math.round((found.length / terms.length) * 100), detail: `${found.length} of ${terms.length} keywords an ATS would search for in this role found` });
  }

  const weights = job ? WEIGHTS_WITH_JOB : keywords ? WEIGHTS_ROLE : WEIGHTS_NO_JOB;
  for (const c of components) c.weight = weights[c.key];
  if (aiQuality != null) {
    const ruleWeight = components.reduce((t, c) => t + c.weight, 0);
    components.push({ key: 'quality', label: 'Writing quality (AI review)', score: aiQuality, weight: (ruleWeight * AI_SHARE) / (1 - AI_SHARE), detail: 'How convincing the impact, clarity and skills evidence read to a recruiter' });
  }
  const totalWeight = components.reduce((t, c) => t + c.weight, 0);
  let score = Math.round(components.reduce((t, c) => t + c.weight * c.score, 0) / totalWeight);
  if (knockouts.length) score = Math.min(score, MISSING_MUST_HAVE_CAP);

  const improvements = findImprovements({ checks, components, match, keywords, job, knockouts, status });
  if (manipulated) {
    const c = checks.find((x) => x.id === 'injection');
    improvements.unshift({ id: 'injection', area: 'Honesty', severity: 'high', problem: `${c.detail} The CV cannot pass automatically.`, fix: FIXES.injection, gain: 1 });
  }
  let decision = decide(score, knockouts);
  if (manipulated && decision === 'pass') decision = 'review';
  // Shown as whole percentages that add up to 100 (largest remainder)
  const shares = components.map((c) => (c.weight / totalWeight) * 100);
  const whole = shares.map(Math.floor);
  const order = shares.map((v, i) => [v - whole[i], i]).sort((a, b) => b[0] - a[0]);
  const short = 100 - whole.reduce((t, n) => t + n, 0);
  for (let k = 0; k < short; k++) whole[order[k][1]] += 1;
  components.forEach((c, i) => {
    delete c.subWeights;
    c.weight = whole[i];
  });
  return { score, grade: atsGrade(score), decision, components, knockouts, improvements, checks, keywords, jobMatch: quick.jobMatch };
}
