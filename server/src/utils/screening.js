import fs from 'node:fs/promises';
import { extractText, getDocumentProxy } from 'unpdf';
import path from 'node:path';
import JSZip from 'jszip';
import WordExtractor from 'word-extractor';

const MAX_TEXT = 100_000;

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeXml = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (XML_ENTITIES[e] ?? m)
  );

/**
 * Read every text run in a DOCX — body, tables, text boxes, headers and footers.
 * CV templates often put contact details and skills in text boxes or headers,
 * which simpler extractors skip.
 */
async function extractDocxText(buf) {
  const zip = await JSZip.loadAsync(buf);
  const parts = Object.keys(zip.files)
    .filter((n) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(n))
    .sort((a, b) => (a === 'word/document.xml' ? 1 : b === 'word/document.xml' ? -1 : a.localeCompare(b)));
  const chunks = [];
  for (const name of parts) {
    let xml = await zip.file(name).async('string');
    // Word stores text boxes twice (modern + legacy fallback); keep only the modern copy.
    xml = xml.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '');
    xml = xml
      // Table cells are separate blocks (CVs often put Skills and Experience side by side)
      .replace(/<\/w:tc>/g, '\n')
      .replace(/<w:tab\/>/g, ' ')
      .replace(/<w:br\/>|<\/w:p>/g, '\n')
      .replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, '\u0000$1\u0000');
    // Keep only the text inside <w:t> elements
    const text = xml
      .split('\n')
      .map((line) => (line.match(/\u0000[^\u0000]*\u0000/g) || []).map((t) => t.slice(1, -1)).join(''))
      .filter((l) => l.trim())
      .join('\n');
    chunks.push(decodeXml(text));
  }
  return chunks.join('\n');
}

/** Pull plain text out of a PDF or DOCX résumé. Returns '' when the file has no readable text (e.g. a scanned image). */
/** Text of an OpenDocument (.odt) file: paragraphs and headings from content.xml. */
async function extractOdtText(buf) {
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file('content.xml')?.async('string')) ?? '';
  return decodeXml(
    xml
      .replace(/<text:(s|tab)\/>/g, ' ')
      .replace(/<\/text:(p|h)>|<text:line-break\/>/g, '\n')
      .replace(/<[^>]+>/g, '')
  );
}

/** Strip RTF control words and groups, keeping the visible text. */
function extractRtfText(raw) {
  return raw
    .replace(/\{\\\*[^{}]*\}/g, '') // destinations like {\*\generator ...}
    .replace(/\{\\(fonttbl|colortbl|stylesheet|info)[\s\S]*?\}\s*\}/g, '')
    .replace(/\\par[d]?\b|\\line\b/g, '\n')
    // \uN is followed by a one-character fallback for old readers (e.g. \u183\'b7) — drop the fallback
    .replace(/\\u(-?\d+) ?(?:\\'[0-9a-f]{2}|[^\\{}])?/gi, (_, n) => String.fromCharCode(Number(n) < 0 ? Number(n) + 65536 : Number(n)))
    .replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '');
}

const wordExtractor = new WordExtractor();

/**
 * Pull plain text out of a résumé (PDF, DOCX, DOC, ODT, RTF or TXT).
 * Returns '' when the file has no readable text (e.g. a scanned image).
 */
export async function extractResumeText(filePath) {
  try {
    const buf = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    let text = '';
    if (ext === '.pdf') {
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      ({ text } = await extractText(pdf, { mergePages: true }));
    } else if (ext === '.docx') {
      text = await extractDocxText(buf);
    } else if (ext === '.doc') {
      const doc = await wordExtractor.extract(buf);
      text = [doc.getHeaders({ includeFooters: true }), doc.getBody(), doc.getTextboxes({ includeHeadersAndFooters: true })]
        .join('\n')
        .replace(/\t/g, '\n'); // .doc separates table cells with tabs
    } else if (ext === '.odt') {
      text = await extractOdtText(buf);
    } else if (ext === '.rtf') {
      text = extractRtfText(buf.toString('latin1'));
    } else if (ext === '.txt') {
      text = buf.toString('utf8');
    }
    // Keep line breaks (section detection needs them) but tidy spacing within lines
    return text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
      .slice(0, MAX_TEXT);
  } catch (err) {
    console.warn(`[screening] could not read ${path.basename(filePath)}: ${err.message}`);
    return '';
  }
}

export { scoreApplication } from './scoring.js';
import { educationRank } from './scoring.js';

/**
 * Validate an applicant's answers against the job's screening questions.
 * Returns { answers, passed, errors }; knockout questions decide `passed`.
 */
export function evaluateScreening(questions = [], rawAnswers = {}) {
  const errors = {};
  const answers = [];
  let passed = true;
  for (const q of questions) {
    const key = q._id.toString();
    let raw = rawAnswers[key];
    raw = typeof raw === 'string' ? raw.trim() : raw;
    const empty = raw === undefined || raw === null || raw === '';
    if (empty) {
      if (q.required) errors[`answers.${key}`] = 'This question is required';
      continue;
    }
    let answer = raw;
    let ok = true;
    if (q.type === 'yes_no') {
      if (!['yes', 'no'].includes(raw)) {
        errors[`answers.${key}`] = 'Choose yes or no';
        continue;
      }
      if (q.knockout && q.expectedAnswer) ok = raw === q.expectedAnswer;
    } else if (q.type === 'number') {
      answer = Number(raw);
      if (!Number.isFinite(answer) || answer < 0 || answer > 1000) {
        errors[`answers.${key}`] = 'Enter a valid number';
        continue;
      }
      if (q.knockout && q.minValue != null) ok = answer >= q.minValue;
    } else {
      answer = String(raw).slice(0, 2000);
    }
    if (!ok) passed = false;
    answers.push({ questionId: q._id, question: q.question, type: q.type, answer: String(answer), passed: ok, knockout: Boolean(q.knockout) });
  }
  return { answers, passed, errors };
}

/**
 * Decide what happens to a new application, like "auto-disposition" rules in commercial ATSs.
 * Returns { decision: 'rejected' | 'advanced' | null, stage, reasons }.
 * A CV with no readable text is never rejected on CV rules — it goes to a human instead.
 */
export function decideApplication(job, { match, screeningPassed, resumeReadable }) {
  const rules = job.autoScreen || {};
  const reasons = [];
  const review = [];
  if (!screeningPassed && job.autoRejectKnockouts) reasons.push('Failed a knockout screening question');
  if (match && resumeReadable) {
    if (rules.rejectMissingMustHave && match.missingMustHave?.length) {
      reasons.push(`Missing must-have skills: ${match.missingMustHave.join(', ')}`);
    }
    if (rules.rejectBelowScore != null && match.score < rules.rejectBelowScore) {
      reasons.push(`CV match ${match.score}% is below the ${rules.rejectBelowScore}% minimum`);
    }
    if (rules.rejectBelowMinYears && job.minYearsExperience != null) {
      if (match.yearsExperience == null) review.push('Years of experience could not be determined from the CV');
      else if (match.yearsExperience < job.minYearsExperience) {
        reasons.push(`${match.yearsExperience} years of experience is below the ${job.minYearsExperience}-year minimum`);
      }
    }
    if (rules.rejectMissingEducation && job.minEducation) {
      if (!match.education) review.push('No degree found in the CV — check education manually');
      else if (educationRank(match.education.level) < educationRank(job.minEducation)) {
        reasons.push(`Education (${match.education.label}) is below the required level`);
      }
    }
  }
  if (reasons.length) return { decision: 'rejected', stage: 'rejected', reasons };

  if (!resumeReadable) review.push('CV text could not be read — needs manual review');
  else if (!screeningPassed) review.push('Failed a knockout question (auto-reject is off)');
  if (match?.flags?.length) review.push(`Possible keyword stuffing: ${match.flags.join('; ')}`);

  const canShortlist = match && resumeReadable && screeningPassed && !review.length;
  if (canShortlist && rules.advanceAtScore != null && match.score >= rules.advanceAtScore) {
    return { decision: 'advanced', stage: 'screening', reasons: [`CV match ${match.score}% meets the ${rules.advanceAtScore}% shortlist threshold`] };
  }
  return { decision: null, stage: 'applied', reasons: review };
}

/** Apply a decision to an application document and return the activity message, if any. */
export function applyDecision(app, result) {
  app.autoDecision = result.decision ?? 'review';
  app.autoDecisionReasons = result.reasons;
  app.autoRejected = result.decision === 'rejected';
  app.stage = result.stage;
  app.stageChangedAt = new Date();
  if (result.decision === 'rejected') return { type: 'auto_rejected', message: `Automatically rejected: ${result.reasons.join('; ')}` };
  if (result.decision === 'advanced') return { type: 'auto_advanced', message: `Automatically shortlisted to Screening: ${result.reasons.join('; ')}` };
  return null;
}
