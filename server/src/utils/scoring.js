/**
 * CV scoring engine. Pure functions only (no I/O), so every rule is unit-testable.
 *
 * The score combines up to five components, each 0–100, weighted and renormalised
 * over the components the job actually configures:
 *   must-have skills 45 · nice-to-have skills 15 · experience 20 · job title 10 · education 10
 *
 * Skills earn credit by *where* they appear: in work experience/projects (1.0), listed in a
 * skills or summary section (0.9), in education (0.8), only in the cover letter (0.7), or in an
 * aspirational phrase like "want to learn React" (0.3). Each skill counts once, however often
 * it is repeated, and keyword stuffing is flagged.
 */

export const SCORING_VERSION = 2;

const WEIGHTS = { must: 45, nice: 15, experience: 20, title: 10, education: 10 };

// ---------------------------------------------------------------------------
// Skill synonyms. Each group is matched as a unit; aliases are whole-word matches.
// Ambiguous short words (e.g. "go", "r", "c") are only used when a job lists them itself.
// ---------------------------------------------------------------------------
const SYNONYM_GROUPS = [
  ['javascript', 'js', 'ecmascript', 'es6'],
  ['typescript', 'ts'],
  ['react', 'react.js', 'reactjs'],
  ['react native', 'react-native'],
  ['next.js', 'nextjs'],
  ['vue', 'vue.js', 'vuejs'],
  ['angular', 'angularjs', 'angular.js'],
  ['node.js', 'node', 'nodejs'],
  ['express', 'express.js', 'expressjs'],
  ['nestjs', 'nest.js'],
  ['python', 'python3'],
  ['golang', 'go lang'],
  ['c#', 'csharp', 'c sharp'],
  ['.net', 'dotnet', 'asp.net'],
  ['c++', 'cpp'],
  ['postgresql', 'postgres', 'psql'],
  ['mongodb', 'mongo'],
  ['mysql', 'my sql'],
  ['sql server', 'mssql', 'ms sql'],
  ['elasticsearch', 'elastic search'],
  ['aws', 'amazon web services'],
  ['gcp', 'google cloud', 'google cloud platform'],
  ['azure', 'microsoft azure'],
  ['kubernetes', 'k8s'],
  ['docker', 'dockerfile', 'docker compose', 'docker-compose'],
  ['terraform'],
  ['ci/cd', 'cicd', 'ci-cd', 'continuous integration', 'continuous delivery', 'continuous deployment'],
  ['rest', 'rest api', 'rest apis', 'restful', 'restful api'],
  ['graphql', 'graph ql'],
  ['html', 'html5'],
  ['css', 'css3'],
  ['tailwind', 'tailwind css', 'tailwindcss'],
  ['sass', 'scss'],
  ['accessibility', 'a11y', 'wcag'],
  ['design systems', 'design system', 'component library'],
  ['machine learning', 'ml'],
  ['artificial intelligence', 'ai'],
  ['natural language processing', 'nlp'],
  ['user research', 'ux research', 'usability testing', 'user interviews'],
  ['ux design', 'user experience design', 'ux'],
  ['ui design', 'user interface design'],
  ['prototyping', 'prototype', 'prototypes'],
  ['figma', 'figjam'],
  ['customer success', 'client success'],
  ['account management', 'account manager', 'key account management'],
  ['onboarding', 'customer onboarding', 'client onboarding'],
  ['salesforce', 'sfdc'],
  ['crm', 'customer relationship management'],
  ['excel', 'microsoft excel', 'ms excel'],
  ['power bi', 'powerbi'],
  ['project management', 'pmp'],
  ['agile', 'agile methodology', 'agile methodologies'],
  ['jira', 'atlassian jira'],
  ['git', 'github', 'gitlab'],
  ['linux'],
  ['saas', 'software as a service'],
  // Finance and accounting
  ['financial reporting', 'financial statements', 'financial statement', 'profit and loss', 'p&l', 'balance sheet', 'income statement'],
  ['ifrs', 'international financial reporting standards'],
  ['gaap', 'generally accepted accounting principles'],
  ['reconciliation', 'reconciliations', 'bank reconciliation', 'bank reconciliations', 'reconciling'],
  ['accounts payable', 'a/p', 'payables'],
  ['accounts receivable', 'a/r', 'receivables'],
  ['audit', 'audits', 'auditing'],
  ['tax', 'taxation', 'vat', 'tax filing', 'tax returns', 'withholding tax'],
  ['bookkeeping', 'book keeping', 'bookkeeper'],
  ['payroll', 'payroll processing'],
  ['budgeting', 'budget', 'budgets', 'forecasting'],
  ['acca', 'association of chartered certified accountants'],
  ['cpa', 'certified public accountant'],
  // Customer service and sales
  ['customer service', 'customer support', 'client service', 'customer care', 'serving customers', 'served customers', 'helpdesk', 'help desk'],
  ['communication', 'communication skills', 'communications', 'communicating'],
  ['complaint resolution', 'resolving complaints', 'resolve complaints', 'handling complaints', 'handle complaints', 'complaints'],
  ['call centre', 'call center', 'contact centre', 'contact center'],
  ['zendesk', 'freshdesk'],
  // General business
  ['microsoft office', 'ms office', 'office 365', 'microsoft 365'],
  ['stakeholder management', 'stakeholder engagement', 'stakeholders'],
  ['data analysis', 'data analytics', 'analysing data', 'analyzing data', 'analysed data', 'analyzed data'],
  ['data visualization', 'data visualisation'],
  ['procurement', 'purchasing', 'sourcing'],
  ['supply chain', 'logistics'],
  ['human resources', 'hr'],
  ['recruitment', 'recruiting', 'talent acquisition'],
  // Healthcare
  ['patient care', 'patient management'],
  ['registered nurse', 'rn'],
];

const SYNONYMS = new Map();
for (const group of SYNONYM_GROUPS) for (const term of group) SYNONYMS.set(term, group);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** All spellings that count for a job skill: the job's own "a | b" aliases plus known synonyms. */
export function skillAliases(skill) {
  const own = skill
    .split('|')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const all = new Set(own);
  for (const term of own) for (const syn of SYNONYMS.get(term) ?? []) all.add(syn);
  return [...all];
}

export const skillLabel = (skill) => skill.split('|')[0].trim();

/** Whole-word regex for one alias; allows a plural "s" on longer plain words. */
function aliasRegex(alias) {
  const plural = /^[a-z][a-z ]{3,}$/.test(alias) && !alias.endsWith('s') ? '(?:s|es)?' : '';
  return new RegExp(`(?<![a-z0-9+#])${escapeRegex(alias)}${plural}(?![a-z0-9+#])`, 'gi');
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
// Common real-world headings (LinkedIn export, Europass, Word/Canva templates). Longer variants first.
const SECTION_HEADINGS = [
  ['experience', /^(work experience|professional experience|relevant experience|volunteer experience|employment history|work history|career history|professional background|experience|employment)\b/i],
  ['projects', /^(personal projects|key projects|selected projects|projects)\b/i],
  ['skills', /^(technical skills|top skills|key skills|core skills|digital skills|personal skills|computer skills|skills (?:&|and) tools|skill set|skillset|skills|core competencies|key competencies|competencies|technologies|tools|tech stack|technical expertise|expertise)\b/i],
  ['education', /^(education (?:&|and) training|academic background|academic qualifications|education|academics|qualifications)\b/i],
  ['summary', /^(professional summary|career summary|professional profile|personal statement|summary|profile|about me|about|objective|career objective)\b/i],
  ['certifications', /^(certifications|certificates|licenses|licences|courses|training)\b/i],
  ['other', /^(languages|language skills|references|interests|hobbies|awards|honors|honours|publications|contact|contact information|personal information|personal details)\b/i],
];

/** Split CV text into named sections. Lines before the first heading form the "header". */
export function splitSections(text) {
  const sections = { header: [] };
  let current = 'header';
  let found = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let matched = false;
    for (const [name, rx] of SECTION_HEADINGS) {
      const m = line.match(rx);
      if (!m) continue;
      const rest = line.slice(m[0].length).replace(/^\s*[:\-–—|]\s*/, '');
      // A heading is a short line on its own, or "Heading: content"
      if ((rest === '' && line.length <= 40) || /^[^:]{0,30}:/.test(line)) {
        current = name;
        sections[current] ??= [];
        if (rest) sections[current].push(rest);
        matched = found = true;
      }
      break;
    }
    if (!matched) sections[current].push(line);
  }
  return { sections, structured: found };
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------
const EVIDENCE = {
  experience: { credit: 1, label: 'Used in work experience' },
  listed: { credit: 0.9, label: 'Listed on CV' },
  education: { credit: 0.8, label: 'Mentioned in education' },
  cover_letter: { credit: 0.7, label: 'Only in cover letter' },
  aspirational: { credit: 0.3, label: 'Only as something to learn' },
};
const SECTION_EVIDENCE = {
  experience: 'experience',
  projects: 'experience',
  skills: 'listed',
  summary: 'listed',
  certifications: 'listed',
  header: 'listed',
  education: 'education',
  other: 'listed',
};
const ASPIRATIONAL = /(learn(ing)?|want(ing)? to|would like to|hope to|hoping to|interested in|beginner|basic (knowledge|understanding)|familiar(ity)? with|exposure to|currently studying|eager to|plan to)\b[^.;:]*$/i;

function findSkill(skill, sectionLines, coverLetter) {
  const regexes = skillAliases(skill).map(aliasRegex);
  let best = null;
  let occurrences = 0;
  const consider = (evidence, line) => {
    if (!best || EVIDENCE[evidence].credit > EVIDENCE[best.evidence].credit) best = { evidence, snippet: line.slice(0, 160) };
  };
  for (const [section, lines] of Object.entries(sectionLines)) {
    for (const line of lines) {
      for (const rx of regexes) {
        rx.lastIndex = 0;
        let m;
        while ((m = rx.exec(line))) {
          occurrences += 1;
          const before = line.slice(Math.max(0, m.index - 60), m.index);
          consider(ASPIRATIONAL.test(before) ? 'aspirational' : SECTION_EVIDENCE[section] ?? 'listed', line);
        }
      }
    }
  }
  if (!best && coverLetter) {
    for (const rx of regexes) {
      rx.lastIndex = 0;
      const m = rx.exec(coverLetter);
      if (m) {
        const start = Math.max(0, m.index - 60);
        consider('cover_letter', coverLetter.slice(start, m.index + 100).replace(/\s+/g, ' ').trim());
        break;
      }
    }
  }
  return { best, occurrences };
}

// ---------------------------------------------------------------------------
// Years of experience
// ---------------------------------------------------------------------------
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const MONTH_INDEX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
// "Jan 2019", "1 January 2019", "03/2019", "15/03/2019" (day/month/year), "2019/03" or "2019-03" (year first), or just "2019"
const DATE = (n) =>
  `(?:(?<ya${n}>(?:19|20)\\d{2})[/.-](?<na${n}>0?[1-9]|1[0-2])(?!\\d)|(?:(?:\\d{1,2}(?:st|nd|rd|th)?\\s+)?(?<m${n}>${MONTH})\\.?,?\\s+|(?:\\d{1,2}\\s*[/.]\\s*)?(?<n${n}>\\d{1,2})\\s*[/.]\\s*)?(?<y${n}>(?:19|20)\\d{2}))`;
const RANGE = new RegExp(
  `${DATE(1)}\\s*(?:-|–|—|to|until|till)\\s*(?:${DATE(2)}|(?<present>present|current|now|today|date|ongoing))`,
  'gi'
);
// Degree words only — people also *work* at universities, so institution names alone don't exclude a line
const SCHOOL_LINE = /\b(bachelor|master'?s? (?:of|in|degree)|b\.?\s?sc|m\.?\s?sc|mba|degree|diploma|ph\.?\s?d|high school|graduat(?:ed|ion))/i;

/** Total years of work experience from date ranges (overlaps merged), or a stated "N years of experience". */
export function estimateYears(sectionLines, structured, now = new Date()) {
  const workLines = [...(sectionLines.experience ?? []), ...(sectionLines.projects ?? [])];
  // Messy layouts (tables, columns) can hide the Experience heading: then scan everything except education
  const lines =
    structured && workLines.length
      ? workLines
      : Object.entries(sectionLines)
          .filter(([name]) => name !== 'education')
          .flatMap(([, l]) => l);
  const nowIdx = now.getFullYear() * 12 + now.getMonth();
  const intervals = [];
  for (const [i, line] of lines.entries()) {
    // Europass-style CVs put the dates on one line and the school/degree on the next
    if (SCHOOL_LINE.test(line) || SCHOOL_LINE.test(lines[i + 1] ?? '')) continue;
    RANGE.lastIndex = 0;
    let m;
    while ((m = RANGE.exec(line))) {
      const g = m.groups;
      const month = (name, num, fallback) =>
        name ? MONTH_INDEX[name.slice(0, 3).toLowerCase()] : num && +num >= 1 && +num <= 12 ? +num - 1 : fallback;
      const start = +(g.y1 ?? g.ya1) * 12 + month(g.m1, g.n1 ?? g.na1, 0);
      let end = g.present ? nowIdx : +(g.y2 ?? g.ya2) * 12 + month(g.m2, g.n2 ?? g.na2, 0);
      if (!g.present && !g.m1 && !g.n1 && !g.na1 && !g.m2 && !g.n2 && !g.na2 && g.y1 === g.y2) end += 6; // "2021 - 2021"
      end = Math.min(end, nowIdx);
      if (end > start && end - start < 50 * 12) intervals.push([start, end]);
    }
  }
  if (intervals.length) {
    intervals.sort((a, b) => a[0] - b[0]);
    let total = 0;
    let [cs, ce] = intervals[0];
    for (const [s, e] of intervals.slice(1)) {
      if (s <= ce) ce = Math.max(ce, e);
      else {
        total += ce - cs;
        [cs, ce] = [s, e];
      }
    }
    total += ce - cs;
    return { years: Math.round((total / 12) * 10) / 10, source: 'dates' };
  }
  const all = Object.values(sectionLines).flat().join('\n');
  const stated = [...all.matchAll(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:professional\s+|work\s+|industry\s+|relevant\s+|hands-on\s+)?experience/gi)].map((x) => +x[1]);
  if (stated.length) return { years: Math.max(...stated), source: 'stated' };
  return { years: null, source: null };
}

// ---------------------------------------------------------------------------
// Education
// ---------------------------------------------------------------------------
export const EDUCATION_LEVELS = [
  { value: 'high_school', label: 'High school', rank: 1, rx: /\b(high school|secondary school|grade 12|ged|a[- ]levels?)\b/i },
  { value: 'diploma', label: 'Diploma / Associate', rank: 2, rx: /\b(diploma|associate'?s? degree|associate of|hnd)\b/i },
  { value: 'bachelor', label: "Bachelor's degree", rank: 3, rx: /\b(bachelor'?s?|b\.?\s?sc|bsc|b\.s\.|b\.a\.?|ba(?=\s*\(hons?\)|\s+(?:in\s+|of\s+)?[a-z])|bba|llb|b\.?\s?com|b\.?\s?eng|beng|b\.?\s?tech|btech|undergraduate degree|licentiate)\b/i },
  { value: 'master', label: "Master's degree", rank: 4, rx: /\b(master'?s?(?! of ceremon)|m\.?\s?sc|msc|m\.s\.|mba|m\.?\s?eng|meng|m\.a\.|ma in|m\.?\s?tech|mtech|mphil)\b/i },
  { value: 'phd', label: 'PhD / Doctorate', rank: 5, rx: /\b(ph\.?\s?d|doctorate|doctor of philosophy|dphil)\b/i },
];
const LEVEL = Object.fromEntries(EDUCATION_LEVELS.map((l) => [l.value, l]));

export function detectEducation(sectionLines, structured) {
  const lines = structured && sectionLines.education?.length ? sectionLines.education : Object.values(sectionLines).flat();
  const text = lines.join('\n').replace(/scrum master|master(ed|ing)\b|masterclass/gi, '');
  let best = null;
  for (const level of EDUCATION_LEVELS) if (level.rx.test(text) && (!best || level.rank > best.rank)) best = level;
  return best ? { level: best.value, label: best.label } : null;
}

// ---------------------------------------------------------------------------
// Job title relevance
// ---------------------------------------------------------------------------
const TITLE_STOP = new Set(['senior', 'sr', 'junior', 'jr', 'lead', 'principal', 'staff', 'head', 'chief', 'mid', 'level', 'i', 'ii', 'iii', 'iv', 'of', 'and', 'the', 'a', 'an', 'for', 'at', 'in', 'with', 'to', 'intern', 'trainee', 'associate', 'remote']);
const TITLE_SYNONYMS = { developer: 'engineer', programmer: 'engineer', dev: 'engineer', swe: 'engineer', sde: 'engineer', designers: 'designer', managers: 'manager', engineers: 'engineer', developers: 'engineer' };

const ROLE_WORDS = new Set(['engineer', 'manager', 'designer', 'analyst', 'specialist', 'consultant', 'administrator', 'architect', 'scientist', 'coordinator', 'representative', 'officer', 'assistant', 'executive', 'director', 'technician', 'writer']);

function titleTokens(s) {
  return new Set(
    s
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/front[\s-]end/g, 'frontend')
      .replace(/back[\s-]end/g, 'backend')
      .replace(/full[\s-]stack/g, 'fullstack')
      .split(/[^a-z0-9+#]+/)
      .map((t) => TITLE_SYNONYMS[t] ?? t)
      .filter((t) => t && !TITLE_STOP.has(t))
  );
}

export function matchTitle(jobTitle, sectionLines, structured) {
  const want = titleTokens(jobTitle);
  if (!want.size) return null;
  const hasExperience = structured && (sectionLines.experience?.length ?? 0) > 0;
  const lines = [
    ...(sectionLines.header ?? []).slice(0, 6),
    ...(hasExperience ? [...sectionLines.experience, ...(sectionLines.summary ?? [])] : Object.values(sectionLines).flat()),
  ].filter((l) => l.length <= 120);
  // The specialty ("frontend", "product", "data") matters more than the role noun ("engineer")
  const roles = [...want].filter((t) => ROLE_WORDS.has(t));
  const specialty = [...want].filter((t) => !ROLE_WORDS.has(t));
  let best = { score: 0, line: null };
  // Score each part of a line separately: "Senior Frontend Developer | jane@x.com" → "Senior Frontend Developer"
  const segments = lines.flatMap((l) => l.split(/\s+[|·•]\s+|\s+[–—]\s+|,\s+/).map((x) => x.trim()).filter(Boolean));
  for (const line of segments) {
    const have = titleTokens(line);
    const frac = (list) => list.filter((t) => have.has(t)).length / list.length;
    const score =
      roles.length && specialty.length
        ? Math.round(40 * frac(roles) + 60 * frac(specialty))
        : Math.round(100 * frac([...want]));
    if (score > best.score) best = { score, line };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
/**
 * Score a CV against a job. Returns null when the job has nothing to score against.
 * `resumeText` should keep its line breaks so sections can be detected.
 */
export function scoreApplication(job, { resumeText = '', coverLetter = '' } = {}, now = new Date()) {
  const must = job.mustHaveSkills || [];
  const nice = job.niceToHaveSkills || [];
  const minYears = job.minYearsExperience ?? null;
  const minEducation = job.minEducation || null;
  if (!must.length && !nice.length && minYears == null && !minEducation) return null;

  const { sections, structured } = splitSections(resumeText);
  const flags = [];

  // Keyword-stuffing signals
  const skillItems = (sections.skills ?? []).join(',').split(/[,;•|·\n]+/).filter((s) => s.trim()).length;
  if (skillItems > 60) flags.push(`Unusually long skills list (${skillItems} items)`);
  // Words outside the skills list: stuffed CVs are almost all keywords
  const proseWords = Object.entries(sections)
    .filter(([name]) => name !== 'skills')
    .flatMap(([, lines]) => lines)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;

  const skills = [];
  for (const [list, required] of [
    [must, true],
    [nice, false],
  ]) {
    for (const skill of list) {
      const { best, occurrences } = findSkill(skill, sections, coverLetter);
      if (occurrences > 12) flags.push(`"${skillLabel(skill)}" repeated ${occurrences} times`);
      skills.push({
        skill: skillLabel(skill),
        required,
        found: Boolean(best),
        evidence: best?.evidence ?? null,
        evidenceLabel: best ? EVIDENCE[best.evidence].label : 'Not found',
        snippet: best?.snippet ?? null,
        credit: best ? EVIDENCE[best.evidence].credit : 0,
      });
    }
  }
  const foundCount = skills.filter((s) => s.found).length;
  if (proseWords < 10 && foundCount >= 5) flags.push('Very little detail beyond a list of keywords');
  // If stuffing is suspected, being merely "listed" is worth less
  if (flags.length) for (const s of skills) if (s.evidence === 'listed') s.credit = 0.6;

  const avg = (list) => Math.round((list.reduce((t, s) => t + s.credit, 0) / list.length) * 100);
  const components = [];
  const mustSkills = skills.filter((s) => s.required);
  const niceSkills = skills.filter((s) => !s.required);
  if (mustSkills.length) {
    components.push({ key: 'must', label: 'Must-have skills', weight: WEIGHTS.must, score: avg(mustSkills), detail: `${mustSkills.filter((s) => s.credit >= 0.5).length} of ${mustSkills.length} found` });
  }
  if (niceSkills.length) {
    components.push({ key: 'nice', label: 'Nice-to-have skills', weight: WEIGHTS.nice, score: avg(niceSkills), detail: `${niceSkills.filter((s) => s.credit >= 0.5).length} of ${niceSkills.length} found` });
  }

  const exp = estimateYears(sections, structured, now);
  if (minYears != null) {
    const score = exp.years == null ? 0 : minYears === 0 ? 100 : Math.min(100, Math.round((exp.years / minYears) * 100));
    components.push({
      key: 'experience',
      label: 'Experience',
      weight: WEIGHTS.experience,
      score,
      detail: exp.years == null ? `Could not determine (needs ${minYears}+ years)` : `${exp.years} years (needs ${minYears}+)`,
    });
  }

  const title = matchTitle(job.title || '', sections, structured);
  if (title) {
    components.push({
      key: 'title',
      label: 'Job title match',
      weight: WEIGHTS.title,
      score: title.score,
      detail: title.line ? `Closest: "${title.line.slice(0, 80)}"` : 'No similar job title found',
    });
  }

  const education = detectEducation(sections, structured);
  if (minEducation) {
    const need = LEVEL[minEducation]?.rank ?? 0;
    const have = education ? LEVEL[education.level].rank : 0;
    components.push({
      key: 'education',
      label: 'Education',
      weight: WEIGHTS.education,
      score: have >= need ? 100 : have === need - 1 ? 40 : 0,
      detail: `${education ? education.label : 'No degree found'} (needs ${LEVEL[minEducation]?.label ?? minEducation})`,
    });
  }

  const totalWeight = components.reduce((t, c) => t + c.weight, 0);
  const score = Math.round(components.reduce((t, c) => t + c.weight * c.score, 0) / totalWeight);

  return {
    version: SCORING_VERSION,
    score,
    components,
    skills,
    yearsExperience: exp.years,
    yearsSource: exp.source,
    education,
    titleMatch: title,
    flags: [...new Set(flags)],
    structured,
    // Summary lists used by filters, badges and decision rules
    matched: skills.filter((s) => s.credit >= 0.5).map((s) => s.skill),
    missingMustHave: mustSkills.filter((s) => s.credit < 0.5).map((s) => s.skill),
    missingNiceToHave: niceSkills.filter((s) => s.credit < 0.5).map((s) => s.skill),
  };
}

export const educationRank = (value) => LEVEL[value]?.rank ?? 0;
