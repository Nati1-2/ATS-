/**
 * AI reports and the read-only hiring assistant (Google Gemini).
 *
 * Both only *describe* data: numbers come from utils/insights.js (database queries limited to
 * what the user may see), and the assistant's tools are all read-only — there is no tool that
 * changes a stage, sends a message or edits a record.
 */
import { Type } from '@google/genai';
import { Job, Application } from '../models/index.js';
import { hiringStats, findApplications, jobScope } from './insights.js';
import { AI_MODEL, defaultGenerate, friendlyError, withModelFallback, withTimeout } from './ai.js';

const TIMEOUT_MS = 90_000;
const MAX_TOOL_ROUNDS = 6;

const FAIRNESS = `Fairness rules (mandatory): talk only about job-relevant evidence (skills, experience, CV match,
screening results, stage). Never mention, infer or use name origin, gender, age, nationality, ethnicity, religion,
family status, disability or appearance. You give information; people make every hiring decision.`;

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
const REPORT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING, description: 'One sentence: the single most important takeaway.' },
    summary: { type: Type.STRING, description: '2-4 sentences on the overall state of hiring.' },
    highlights: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Up to 4 things going well, each citing a number.' },
    risks: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Up to 4 problems or bottlenecks, each citing a number.' },
    recommendations: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Up to 4 concrete next steps for the hiring team.' },
    candidateNotes: {
      type: Type.ARRAY,
      description: 'Optional one-line notes for some candidates listed in topCandidates or stuck.',
      items: {
        type: Type.OBJECT,
        properties: { applicationId: { type: Type.STRING }, note: { type: Type.STRING } },
        required: ['applicationId', 'note'],
      },
    },
  },
  required: ['headline', 'summary', 'highlights', 'risks', 'recommendations', 'candidateNotes'],
};

const REPORT_SYSTEM = `You write short, practical hiring reports for a recruiting team.
Use ONLY the JSON data you are given. Every number you mention must appear in that data; never estimate or invent.
"stuck" lists people waiting 7+ days in one stage. "skillGaps" counts applicants missing a must-have skill.
"weekly" is applications per week, oldest first. Plain English, no jargon, no markdown.
${FAIRNESS}`;

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (v, n = 4) => (Array.isArray(v) ? v.map((x) => str(x, 300)).filter(Boolean).slice(0, n) : []);

/** Write the narrative for a report. Returns { status: 'done', narrative, model } or { status: 'failed', error }. */
export async function writeReport(stats, { generate = defaultGenerate } = {}) {
  const data = { ...stats, jobs: undefined }; // the job list adds tokens but nothing to the story
  const out = await withModelFallback(async (model) => {
    const res = await withTimeout(
      generate({
        model,
        contents: [{ role: 'user', parts: [{ text: `Hiring data (JSON):\n${JSON.stringify(data)}\n\nWrite the report.` }] }],
        config: { systemInstruction: REPORT_SYSTEM, responseMimeType: 'application/json', responseSchema: REPORT_SCHEMA, temperature: 0.3 },
      }),
      TIMEOUT_MS
    );
    let parsed;
    try {
      parsed = JSON.parse(res?.text);
    } catch {
      throw Object.assign(new Error('AI returned invalid JSON'), { retryable: true });
    }
    return parsed;
  });
  if (!out.ok) return { status: 'failed', error: friendlyError(out.error), rateLimited: out.rateLimited };
  const known = new Set([...stats.topCandidates, ...stats.stuck].map((c) => c.applicationId));
  const n = out.value;
  return {
    status: 'done',
    model: out.model,
    narrative: {
      headline: str(n.headline, 300),
      summary: str(n.summary, 1200),
      highlights: list(n.highlights),
      risks: list(n.risks),
      recommendations: list(n.recommendations),
      // Only keep notes about candidates that are actually in the report
      candidateNotes: (Array.isArray(n.candidateNotes) ? n.candidateNotes : [])
        .filter((c) => known.has(c?.applicationId))
        .slice(0, 10)
        .map((c) => ({ applicationId: c.applicationId, note: str(c.note, 240) })),
    },
  };
}

// ---------------------------------------------------------------------------
// Assistant (chat with read-only tools)
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    name: 'list_jobs',
    description: 'List the jobs the user can see, with status and number of applications. Use it to find a job id.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'get_hiring_stats',
    description:
      'Hiring numbers for one job or all jobs: totals, applications per stage, automatic decisions, CV match distribution, applications per week, people waiting 7+ days, top candidates, skill gaps, time to hire, upcoming interviews.',
    parameters: {
      type: Type.OBJECT,
      properties: { jobId: { type: Type.STRING, description: 'Optional job id from list_jobs. Omit for all jobs.' } },
    },
  },
  {
    name: 'search_candidates',
    description:
      'Find applications. Each result has the candidate name, job, stage, days in stage, CV match %, years of experience, missing must-have skills, automatic decision and AI fit/summary when available.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Part of a candidate name' },
        jobId: { type: Type.STRING, description: 'Job id from list_jobs' },
        stage: { type: Type.STRING, enum: ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'] },
        minScore: { type: Type.NUMBER, description: 'Minimum CV match %' },
        decision: { type: Type.STRING, enum: ['advanced', 'review', 'rejected'], description: 'Automatic decision when they applied' },
        sort: { type: Type.STRING, enum: ['score', 'newest'] },
        limit: { type: Type.NUMBER, description: 'Max results, 1-25 (default 10)' },
      },
    },
  },
  {
    name: 'list_upcoming_interviews',
    description: 'Scheduled interviews from today on, optionally for one job.',
    parameters: { type: Type.OBJECT, properties: { jobId: { type: Type.STRING } } },
  },
];

async function runTool(user, name, args = {}) {
  switch (name) {
    case 'list_jobs': {
      const ids = await jobScope(user);
      const [jobs, counts] = await Promise.all([
        Job.find({ _id: { $in: ids } }).select('title status department location').sort({ updatedAt: -1 }).lean(),
        Application.aggregate([{ $match: { job: { $in: ids } } }, { $group: { _id: '$job', n: { $sum: 1 } } }]),
      ]);
      const n = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
      return jobs.map((j) => ({ jobId: String(j._id), title: j.title, status: j.status, department: j.department, location: j.location, applications: n[String(j._id)] ?? 0 }));
    }
    case 'get_hiring_stats': {
      const stats = await hiringStats(user, { jobId: args.jobId });
      delete stats.jobs;
      return stats;
    }
    case 'search_candidates':
      return findApplications(user, args);
    case 'list_upcoming_interviews':
      return (await hiringStats(user, { jobId: args.jobId })).upcomingInterviews;
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

function assistantSystem(user) {
  const today = new Date().toISOString().slice(0, 10);
  return `You are the hiring assistant inside an applicant tracking system. Today is ${today}.
You are talking to ${user.name} (${user.role.replace('_', ' ')}).

You are READ-ONLY: you can look things up with your tools but cannot change anything (no moving stages,
sending emails, scheduling or editing). If asked to change something, say you can't and tell them where to do it
in the app (e.g. "open the candidate's profile and change the Stage").

Always use your tools to get facts before answering questions about jobs, candidates or numbers. Never invent
names, numbers or details; if the tools don't have it, say so. Only data the user is allowed to see is available.
When you mention a candidate, link their profile as a markdown link: [Full Name](/candidates/<candidateId>?application=<applicationId>).
When you mention a job, you may link it: [Job title](/jobs/<jobId>).
Be concise: short paragraphs or bullet lists, plain English. Contact details are not available to you.
${FAIRNESS}`;
}

/**
 * One assistant turn. `messages` is the visible chat history [{ role: 'user'|'assistant', content }].
 * Returns { reply, tools } or { error, rateLimited }.
 */
export async function chat(user, messages, { generate = defaultGenerate } = {}) {
  const history = messages.slice(-12).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content).slice(0, 4000) }],
  }));
  const used = [];

  const out = await withModelFallback(async (model) => {
    const contents = [...history];
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await withTimeout(
        generate({
          model,
          contents,
          config: { systemInstruction: assistantSystem(user), tools: [{ functionDeclarations: TOOLS }], temperature: 0.2 },
        }),
        TIMEOUT_MS
      );
      const calls = res?.functionCalls ?? [];
      if (!calls.length) {
        const text = (res?.text ?? '').trim();
        if (!text) throw Object.assign(new Error('AI returned an empty answer'), { retryable: true });
        return text;
      }
      // Keep the model's own turn exactly as returned (Gemini needs its thought signatures back)
      contents.push(res.candidates?.[0]?.content ?? { role: 'model', parts: calls.map((c) => ({ functionCall: c })) });
      const parts = [];
      for (const call of calls) {
        used.push(call.name);
        let response;
        try {
          response = { result: await runTool(user, call.name, call.args ?? {}) };
        } catch (err) {
          response = { error: err.message };
        }
        parts.push({ functionResponse: { name: call.name, response, ...(call.id ? { id: call.id } : {}) } });
      }
      contents.push({ role: 'user', parts });
    }
    return 'I looked up a lot of data but could not finish the answer. Please ask a more specific question.';
  });

  if (!out.ok) return { error: friendlyError(out.error), rateLimited: out.rateLimited };
  return { reply: out.value, tools: [...new Set(used)], model: out.model };
}

export { AI_MODEL };
