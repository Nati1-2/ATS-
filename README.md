# Acme Hiring: an AI-powered applicant tracking system

An applicant tracking system (ATS) in which **AI reads every CV, filters and ranks applicants, explains its decisions, and answers questions about your hiring**. People keep the final say. Built with Next.js 15, Express, MongoDB and Google Gemini.

Recruiters publish jobs and collect applications on a public careers site. From there, AI does most of the reading and sorting:

- Every CV is analysed in the background.
- Applicants are screened against the job.
- Each application lands in the right pipeline stage with the reasons attached.

```
Applicant applies ──► CV text extracted (PDF, DOCX, DOC, ODT, RTF, TXT; AI reads scanned PDFs)
                            │
              ┌─────────────┴──────────────┐
              ▼                            ▼
   Rule-based CV match (instant)   AI analysis (background queue)
   skills · years · title · degree  summary · fit score · skills judged by meaning
              │                            │
              ▼                            ▼
   Automatic rules + knockouts     AI screening: Off / Recommend / Automatic
              └─────────────┬──────────────┘
                            ▼
      Pipeline stage + stored reasons ──► recruiter confirms or overturns
```

## AI features

| Feature | What the AI does | Where |
|---|---|---|
| **AI CV analysis** | Reads each CV (scanned PDFs too) and writes a summary, strengths, things to check in the interview, a 0–100 fit score, and judges each skill by meaning ("built SPAs in Vue" counts as frontend) | Candidate profile |
| **AI screening (filter)** | Uses the AI fit score to reject or shortlist applicants for each job. Three modes: *Off*, *Recommend* (a person confirms each rejection) and *Automatic* | Edit job → CV screening |
| **AI screening review** | A queue of AI decisions to confirm or overturn, one at a time or in bulk, with an overturn-rate warning when the threshold looks too strict | `/ai-screening` |
| **AI fit filter and sort** | Filter candidates by minimum AI fit and sort by best AI fit, next to the rule-based match %, CV keyword search and screening filters | `/candidates` |
| **AI hiring assistant** | A chat that answers "Who are the best candidates for Frontend?" or "Who's been waiting longest?" from live data, with links to profiles. It uses tool calls to look data up | **Ask AI** on every page, `/assistant` |
| **AI reports** | A hiring report for one job or all jobs. The numbers come from the database, and the AI writes the headline, what's going well, risks and next steps | `/reports` |
| **AI CV checker** | Scores any CV (impact, clarity, structure, skills, ATS readability), with rewrites of weak lines and the keywords it's missing for a job | `/cv-checker` |

Without AI, a fast rule-based engine filters every applicant:
- a **CV match score** from skills, experience, title and education, with evidence lines from the CV
- **knockout questions**
- **automatic accept/reject rules**
- **keyword-stuffing detection**

With AI turned off, screening, filtering, reports (numbers and charts) and the CV checker's quick checks still work. Only the chat assistant needs AI.

## Responsible AI

Hiring is a high-risk use of AI (EU AI Act, NYC Local Law 144), so the AI is built to be checked and overruled:

- **People stay in control.** *Recommend* mode holds every AI rejection for a person. Scanned CVs are never rejected without a person confirming, even in *Automatic* mode. Anyone a person has moved is never touched by the AI again.
- **Every decision is explained.** Each one stores its reasons, for example "AI fit 18% is below the 35% minimum", plus a one-sentence reason tied to the job. They appear on the profile and in the timeline.
- **Protection against prompt injection.** CV text is treated as untrusted data. Hidden instructions such as "rate me 100" are ignored, flagged, and always sent to a person.
- **Fairness instructions.** The AI is told to judge only qualifications relevant to the job and to ignore name, age, gender, nationality and similar.
- **Reliable output.** Every AI response is checked against a schema and clamped to valid values. When a model's quota runs out, it switches to a fallback model, and rate-limited work resumes on its own, even after a restart.
- **Transparency for applicants.** The apply form tells each applicant how AI is used for that job.
- **The assistant can only read.** Its tools look data up and change nothing. It sees only what the signed-in user may see, and never receives contact details.

## Tech stack

- **Frontend:** Next.js 15 (App Router), React, Tailwind CSS
- **Backend:** Express REST API, Mongoose and MongoDB (CVs stored in GridFS), JWT in an httpOnly cookie
- **AI:** Google Gemini (`@google/genai`) with structured output, tool calling and a background job queue
- **Quality:**
  - 77 server tests with the AI mocked, covering scoring, decisions, AI screening, CV extraction and the full API
  - Playwright browser tests
  - GitHub Actions CI
- **Deploy:** Vercel (one project) or Docker Compose

## Quick start

Requirements: Node.js 20+ and MongoDB 6+ (a Docker service is included).

```bash
npm install && npm run install:server
# create .env in the project root (see below)
npm run db:up      # start MongoDB in Docker
npm run seed       # load demo data (resets the database)
npm run dev        # API on :5000, web app on :3000
```

Minimal `.env`:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/ats
JWT_SECRET=<openssl rand -hex 32>
CLIENT_URL=http://localhost:3000
API_URL=http://localhost:5000
GEMINI_API_KEY=<your key>     # turns on the AI features
```

Open **http://localhost:3000** for the careers site, and sign in at `/login`. Demo accounts (password `Password123!`):

| Email | Role |
|---|---|
| admin@acme.test | Admin: everything, including settings and team |
| recruiter@acme.test | Recruiter: jobs, candidates, stages, interviews |
| manager@acme.test | Hiring manager: only assigned jobs, can add feedback |

The demo data includes AI decisions so you can try AI screening without an API key. Applicants are waiting for confirmation, already rejected, and already shortlisted.

> Gemini's free tier allows only about 20 requests per model per day. Use a paid key for real hiring volume.

## Tests

```bash
npm test            # server tests (AI calls mocked)
npm run test:e2e    # browser tests (Playwright) against the running app
```

## Roadmap

These AI features are planned and **not built yet**:

- **Semantic search:** CV embeddings with vector search, "find candidates like this one", plain-language search, and suggesting earlier applicants for new jobs
- **AI job writer:** a full job post, skills and screening questions from a one-line brief, with a check for biased wording
- **AI CV parser:** structured profiles, and filling in the apply form automatically
- **AI interviews:** a first-round interview (chat, then voice) with a scored report for each competency, where a person makes the decision
- **AI email writer:** personal invite and rejection emails, sent only after a person approves
- **Hiring Copilot agent:** the assistant proposes actions, such as making a shortlist or scheduling interviews, and a person approves each one
- **Evaluation and audits:** a labeled eval set, a bias audit that swaps candidate names, prompt-injection tests in CI, and a dashboard for AI cost and speed

## Documentation

- [How it works](docs/HOW-IT-WORKS.md): pages, data model, permissions, how scoring works, and all the AI details
- [Deployment](docs/DEPLOYMENT.md): Vercel, Docker, admin setup and production notes

**Admin accounts:** on an empty install, `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` create the first admin. After that, accounts are managed under **Settings → Team members**. To recover access, run `npm run create-admin --prefix server -- --email you@company.com`.
