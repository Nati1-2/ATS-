# Acme Hiring — Applicant Tracking System

An applicant tracking system (ATS) for a single company, built with **Next.js** and the **MERN stack** (MongoDB, Express, React, Node.js). With it, recruiters can publish jobs, collect applications on a public careers site, review candidates, and move applications through a hiring pipeline.

```
ATS/
├── src/        Next.js 15 (App Router) + Tailwind CSS + Vercel API bridge
├── server/     Express REST API + Mongoose (MongoDB), JWT auth, file uploads
├── vercel.json Vercel single-project zero-config deployment
└── .env        The only environment file (frontend + backend, never committed)
```

The Next.js app proxies `/api/*` to the Express server (see `next.config.mjs`). The browser therefore talks to a single origin, so the httpOnly auth cookie works without any CORS setup.

## Requirements

- Node.js 20 or later (tested on Node 24)
- MongoDB 6 or later. You can use the bundled `docker compose` service or your own instance, such as MongoDB Atlas.

## Setup

```bash
# 1. Install dependencies
npm install
npm run install:server

# 2. Configure environment (one .env for both frontend and backend)
# Create .env in the project root with:
#   MONGODB_URI=mongodb://127.0.0.1:27017/ats   (or your Atlas URI)
#   JWT_SECRET=<openssl rand -hex 32>
#   CLIENT_URL=http://localhost:3000
#   API_URL=http://localhost:5000
#   ADMIN_EMAIL=you@company.com
#   ADMIN_PASSWORD=<at least 8 characters>
#   GEMINI_API_KEY=            (optional, enables AI)

# 3. Start MongoDB (skip if you use your own; set MONGODB_URI in .env)
npm run db:up

# 4. Load demo data (this resets the database)
npm run seed

# 5. Run API (port 5000) and web app (port 3000) together
npm run dev
```

Open **http://localhost:3000**. The root URL redirects to the public careers site. Team members sign in at `/login`.

**Admin login.** Accounts live in the database and sign-in always checks it. On an empty install, when `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set, the API creates that first admin on start; once any active admin exists, `.env` is ignored and never changes stored accounts. To recover a lost admin password, run `npm run create-admin --prefix server -- --email you@company.com`. Once signed in, the admin creates accounts for other people under **Settings → Team members → Create an account**: name, email, role (Admin, Recruiter, Hiring manager) and a password to share with them. Invite links still work as an alternative.

### Demo accounts

All demo accounts use the password `Password123!`.

| Email | Role | Can do |
|---|---|---|
| admin@acme.test | Admin | Everything, including company settings and team management |
| recruiter@acme.test | Recruiter | Jobs, candidates, notes, stages, interviews |
| manager@acme.test | Hiring manager | Sees only assigned jobs (Senior Frontend, Backend, Data Analyst) and can add feedback |

### Tests

```bash
npm test            # server tests: scoring, decisions, AI and AI screening (mocked), CV extraction, full API
npm run test:e2e    # browser tests (Playwright) against the running app
```

- **Server tests** start the real API against a separate `ats_test` database, which is wiped on each run. They read real CV files (PDF, DOCX, DOC, ODT, RTF) in `server/test/fixtures`. Set `MONGODB_URI_TEST` to use another database; the API tests are skipped if MongoDB isn't reachable.
- **Browser tests** (`e2e/`) drive Chromium through the whole product:
  - the brief's flow (job → publish → apply → review → pipeline) and permissions
  - automatic accept/reject, the match report, CV formats and fake files
  - live CV results
  - global search, tabs, filters, and phone layouts
  - AI screening: the sidebar badge, confirm / overturn, and the job settings
  - the CV checker, from the sidebar and from a candidate profile
- **Before running the browser tests:**
  - Install the browser once: `npx --prefix e2e playwright install chromium`.
  - Start the app with AI off (`GEMINI_API_KEY= npm run dev`) so the tests don't spend AI quota.
  - Each spec file re-seeds the demo data first.
- **CI** (`.github/workflows/ci.yml`) runs on every push: server tests, the web build, the browser tests against a production build, and the Docker image build.

## Deploying to Vercel (one project)

The web app and the API deploy together as **one** Vercel project with **one root**:
On Vercel, `src/pages/api/[...path].mjs` serves the Express API directly inside the Next.js app, so every `/api/*` request is handled on the same domain without needing any separate backend deployment.

1. **Database:** create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas), allow network access from anywhere (`0.0.0.0/0`), and copy the connection string (`mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/ats`).
2. **Import:** at https://vercel.com/new, import the repo. **Zero configuration needed** — root directory is left as default `/` and `vercel.json` installs all dependencies automatically.
3. **Environment variables** (add these in Vercel project Settings → Environment Variables):

   | Name | Value |
   |---|---|
   | `MONGODB_URI` | your Atlas connection string |
   | `JWT_SECRET` | `openssl rand -hex 32` |
   | `GEMINI_API_KEY` | optional, enables AI analysis |
   | `CLIENT_URL` | optional; defaults to the project's production URL (set it if you use a custom domain) |

   Do **not** set `API_URL`.
4. **Deploy.** `https://<project>.vercel.app/api/health` should return `{"ok":true,"db":true}`.
5. **First admin:** either set `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` in Vercel (used only while the database has no admin), or run this locally against the Atlas database:

   ```bash
   MONGODB_URI="<atlas uri>" npm run create-admin --prefix server -- --email you@company.com --name "Your Name"
   ```

6. **Careers content (optional):** `npm run sample-data` fills an empty company profile and adds sample published jobs without deleting anything. Replace them with real content under **Settings → Company** and **Jobs** before going live.

After that, every push to `main` redeploys.

### Notes on Vercel

- **Uploaded files are kept in MongoDB** (GridFS bucket `uploads`), so résumés and logos survive redeploys and are shared by every function instance; `/tmp` is only a cache. Back up the database and you have everything.
- **Résumés are limited to 4 MB on Vercel** (whatever `MAX_RESUME_MB` says), because Vercel rejects request bodies over 4.5 MB.
- **Rate limits are per function instance**, so they are looser than on a single server.
- AI rate-limit retries are only picked up again when a new instance starts.

## Production deployment (Docker)

```bash
# Uses the same .env: set JWT_SECRET, CLIENT_URL (public URL) and ADMIN_EMAIL / ADMIN_PASSWORD
docker compose -f docker-compose.prod.yml up -d --build
```

- **Three containers:** MongoDB, the API and the web app. Only the web app is published (on `WEB_PORT`, default 3000); the API and database stay on the internal network.
- **HTTPS:** put the web app behind a reverse proxy such as Caddy, Nginx or a cloud load balancer. Keep `COOKIE_SECURE=true`. Use `false` only for a plain-HTTP trial on a private network.
- **Persistent data:** the database, including uploaded CVs and logos (GridFS), lives in the `mongo-data` volume, so it survives rebuilds and restarts. Back it up; the `uploads` volume is only a cache.
- **Safety:**
  - The API checks its configuration at startup and refuses to start with a weak or missing `JWT_SECRET`.
  - It shuts down gracefully on restart.
  - `/api/health` returns 503 when the database is down, and Docker uses this as the health check.
  - `npm run seed` refuses to run in production, because it deletes all data.
- **Security headers:** `nosniff`, `SAMEORIGIN`, `Referrer-Policy` and `Permissions-Policy` are set on every page.

## Pages

| # | Page | Route |
|---|---|---|
| 1 | Login (plus forgot / reset password, accept invite) | `/login`, `/forgot-password`, `/reset-password`, `/accept-invite` |
| 2 | Dashboard | `/dashboard` |
| 3 | Jobs | `/jobs` (plus a job detail view at `/jobs/:id`) |
| 4 | Create / edit job | `/jobs/new`, `/jobs/:id/edit` |
| 5 | Candidates | `/candidates` |
| 6 | Candidate profile | `/candidates/:id` |
| 7 | Hiring pipeline | `/pipeline?job=:id` |
| 8 | Settings | `/settings` |
| 9 | Public careers | `/careers` |
| 10 | Job details and apply | `/careers/:id` |

## How it works

**Data model** (`server/src/models/index.js`): `User`, `Invite`, `Company`, `Job`, `Candidate`, `Application`, `Note` (internal notes and hiring-manager feedback), `Interview`, and `Activity`.

- A candidate is identified by email. Each `Application` links one candidate to one job and has its own `stage`, so one person can apply to several jobs.
- Every application, stage change, note, and interview writes an `Activity` record. These records make up the profile timeline.
- Dashboard numbers come from live MongoDB counts and aggregations.

**Permissions** (`server/src/middleware/auth.js`): every internal endpoint requires a valid JWT in an httpOnly cookie. Write endpoints also check the user's role. Hiring managers only get data for jobs listed in `job.hiringManagers`. Next.js middleware redirects signed-out users away from internal pages and sends signed-in users from `/login` to the dashboard. The API remains the real authority.

**Résumés**:
- Accepted formats are PDF, DOC, DOCX, ODT, RTF and TXT, up to `MAX_RESUME_MB` (5 MB by default).
- Files are checked on the client (extension, type, size) and again on the server (extension, MIME type, size, and the file's magic bytes).
- Files are stored in MongoDB (GridFS bucket `uploads`), with `server/uploads` as a local cache. They are not publicly served and can only be downloaded through an authenticated, permission-checked endpoint.
- PDFs can be previewed inline. Other formats can only be downloaded.

**CV screening** (`server/src/utils/screening.js`): this works the way common ATSs screen CVs, with no AI involved.
- **Text extraction.** When someone applies, the CV text is extracted and stored privately. Supported formats:
  - **PDF** (via `unpdf`)
  - **DOCX** (body, tables, text boxes, headers and footers; many CV templates keep skills in text boxes)
  - **DOC** (Word 97–2003, via `word-extractor`)
  - **ODT**, **RTF** and **TXT**

  Every upload is checked by its contents (magic bytes), not just its name, so a renamed file is refused.
- **CV match score (0–100%)** (`server/src/utils/scoring.js`). A weighted score built from up to five parts. Only the parts a job sets are counted:

  | Part | Weight | How it's measured |
  |---|---|---|
  | Must-have skills | 45 | Credit depends on *where* the skill appears (see below) |
  | Nice-to-have skills | 15 | Same as must-have skills |
  | Experience | 20 | Years read from job dates such as "Jan 2019 – Present" or "03/2017 - 12/2019". Overlapping jobs are merged and education dates are ignored. If there are no dates, it falls back to "6+ years of experience". |
  | Job title | 10 | Past titles compared with the job title. "Developer" counts as "Engineer" and seniority words are ignored. The specialty ("Frontend", "Product") counts for 60% and the role word for 40%. |
  | Education | 10 | Highest degree found, from high school to PhD. "Scrum Master" is not a master's degree. |

  - **Where a skill appears:** used in work experience or projects = 100% credit, listed in skills or summary = 90%, only in the cover letter = 70%, and phrases like "want to learn React" = 30%.
  - **Synonyms are built in:** K8s = Kubernetes, JS = JavaScript, Postgres = PostgreSQL, WCAG = Accessibility, and about 50 more groups. Add your own with `|`, e.g. `Node.js | Node`.
  - **Whole words only:** "Java" does not match "JavaScript".
  - **Layouts:** CV sections are detected, including CVs with tables or columns. If no Experience heading is found, the whole CV is used rather than scoring 0.
  - **Keyword stuffing:** each skill counts once. Repeated keywords, very long skills lists and CVs that are just a keyword list are flagged. Flagged CVs are never auto-shortlisted.
  - **Re-scoring:** editing a job's skills, experience, education or title re-scores every existing applicant.
  - **Match report:** the profile shows each part's score, where every skill was found (with the CV line as evidence), years, education and any warnings.
- **Screening questions.** Questions can be yes/no, number, or text. Any yes/no or number question can be a *knockout*, for example "authorized to work = yes" or "years of experience ≥ 5". Applicants never see the knockout rules, and they always get the same confirmation.
- **Auto-reject (per job).** When this is on, applicants who fail a knockout go straight to *Rejected*. When it is off, they are flagged "Failed screening".
- **Recruiter tools.**
  - The Candidates page can search *inside CVs* (comma-separated terms must all appear), filter by minimum match % and screening pass/fail, and sort by best match.
  - Profiles show the score, matched and missing skills, and the screening answers.
  - Pipeline cards show the match % and knockout badges.
- **Unreadable files.** Scanned or image-only PDFs have no extractable text. These are flagged so the recruiter knows to review them by hand.

**Automatic accept / reject** (`decideApplication` in `server/src/utils/screening.js`). Each job can set rules that run the moment someone applies:

| Result | When | Stage |
|---|---|---|
| **Auto-rejected** | Fails a knockout question (if auto-reject is on), or one of the optional rules applies: a must-have skill is missing, the CV match is below X%, experience is below the minimum, or education is below the minimum | Rejected |
| **Auto-shortlisted** | Passes every knockout and the CV match is at least Y% | Screening |
| **Needs review** | Everything else. This includes anything the system can't judge safely: unreadable CVs, unknown experience, no degree found, or suspected keyword stuffing | Applied |

- Every decision stores its reasons, e.g. "CV match 33% is below the 50% minimum". These appear on the candidate profile and in the timeline.
- Recruiters can override any decision by changing the stage.
- The applicant always sees the same "Application submitted" message.
- If you add rules after people have applied, use **Run rules** on the job page. It only affects applicants still in *Applied*.
- The Candidates page can filter by decision, and the dashboard shows the counts.

**AI CV analysis (Google Gemini)** (`server/src/utils/ai.js`, `aiQueue.js`). Optional: set `GEMINI_API_KEY` in the root `.env` (and optionally `GEMINI_MODEL`, default `gemini-3.8-flash`).
- **In the background:** applicants get their confirmation immediately, and each CV is analysed afterwards, two at a time. Unfinished work resumes after a restart.
- **Recruiter view:** the profile shows an **AI summary** with strengths, things to check in the interview, an advisory fit level, and skills judged by meaning. The candidates list shows an "AI: strong/good/partial/weak" badge. Older applications have a **Run AI analysis** button.
- **Scanned CVs:** the AI reads image-only PDFs. That text feeds the normal rule-based score, so scanned CVs are no longer stuck at "unreadable". Text read from an image is never used to auto-reject.
- **Decisions:** off by default, the AI only advises. Each job can turn on **AI screening** (below) so the AI's fit score rejects or shortlists applicants.
- **Fairness rules:** the AI is told to judge only job-relevant qualifications and to ignore name, age, gender, nationality and similar.
- **Prompt-injection protection:** CV text is treated as untrusted data. Hidden instructions like "rate me 100" are ignored and flagged as a possible manipulation attempt.
- **Reliability:**
  - The AI's output is checked against a schema and clamped.
  - When a model's quota runs out, it switches to `GEMINI_FALLBACK_MODELS` (default `gemini-2.5-flash`).
  - If every model is out of quota, it waits for the reset time Google reports and retries on its own, even across restarts.
  - Other failures show a "Try again" button.
  - **Free-tier keys allow only about 20 requests per day per model.** Use a paid key for real hiring volume.
- **Transparency:** the apply form tells applicants how AI is used for that job: summaries only, AI screening with a person confirming rejections, or automated AI screening (with the option to ask for a human review).
- **Privacy:** CV content is sent to Google's Gemini API. Mention this in your privacy policy, and check Google's data terms for your plan.

**AI screening** (`server/src/utils/aiScreening.js`, page `/ai-screening`). Works like the "AI fit" screening in commercial ATSs: the AI reads each CV by meaning, not keywords, and its 0–100% fit decides who moves on. Each job sets it under **Edit job → CV screening → AI screening**:

| Mode | What happens |
|---|---|
| **Off** (default) | The AI writes its summary and fit score. People make every decision. |
| **Recommend** | AI rejections wait on the AI screening page until a recruiter confirms or overturns them. Strong fits are shortlisted to Screening straight away. |
| **Automatic** | The AI moves applicants to Rejected or Screening on its own. Recruiters can reinstate anyone. |

- **Rules (per job):** reject if the AI fit is below X%, reject if the AI finds no evidence of a must-have skill (judged by meaning, e.g. "built SPAs in Vue" counts as frontend), and shortlist at Y% or more.
- **Order:** the rule-based decision runs the moment someone applies; AI screening runs when the background analysis finishes, and only for people still in Applied.
- **Safeguards (every mode):**
  - Applicants a person has moved are never touched again, and a reviewed decision is never redone.
  - Unreadable files and CVs with text aimed at the AI ("rate me 100") are always held for a person.
  - Scanned CVs (text read by the AI from an image) are never rejected without a recruiter confirming, even in Automatic mode.
  - A must-have skill only counts as missing when the AI explicitly judged it "none".
  - Shortlisting needs every knockout passed and no keyword-stuffing flags.
- **Reasons:** every decision stores its reasons, such as "AI fit 18% is below the 35% minimum", plus a one-sentence, job-related reason written by the AI. They appear on the candidate profile, in the timeline and on the AI screening page.
- **AI screening page** (sidebar → AI → *AI screening*, with a badge counting decisions waiting for you): tabs for *Awaiting confirmation*, *Rejected by AI*, *Shortlisted by AI*, *Flagged for a person* and *Reviewed*; filter by job, search by name, and confirm or overturn one at a time or in bulk.
- **Overturn rate:** the page shows how often people overturn AI rejections, and warns when it reaches 25%, which is a sign the threshold is too strict. Moving a candidate by hand counts as reviewing the AI's decision.
- **Existing applicants:** use **Run AI screening** on the job page. Finished analyses are decided without a new AI call; anyone without one is queued.
- **Demo data:** the seed includes demo analyses (model `demo-seed`) for the three applicants in Applied. One is waiting for confirmation (Senior Frontend, Recommend mode), one was rejected (Product Designer, Automatic) and one was shortlisted (Customer Success).
- **Compliance:** automated rejection of job applicants is regulated in some places, for example NYC Local Law 144 (bias audits and notice) and the EU AI Act (hiring is "high-risk"; human oversight is required). Recommend mode keeps a person in the loop for every rejection.

**CV checker** (`/cv-checker`, `server/src/utils/cvChecker.js`): in the sidebar under AI. It reviews any CV and explains how to make it better.
- **Input:** upload a file (any accepted format, including scanned PDFs, which the AI reads), paste the text, or open it from a candidate profile with **Check CV quality** on the Résumé tab.
- **Compare with:** one of your jobs, another role you type in, or nothing for a general review.
- **AI review:**
  - An overall score (0–100) with a one-line verdict and summary.
  - Sub-scores with comments for impact, clarity, structure, skills and ATS readability.
  - Strengths, and weaknesses that each say why they matter and how to fix them.
  - Suggestions ordered by priority.
  - Before/after rewrites of weak lines from the CV; unknown numbers are left as `[X%]`, never invented.
  - Section-by-section ratings, missing keywords and quick tips.
- **Quick checks (no AI needed):** readable text, contact details, standard headings, dates for each role, measurable results, weak phrases such as "responsible for", length, long paragraphs, unnecessary personal data, an over-long skills list, and (with a job) the required skills that are missing, using the normal CV match. With AI off, the checker still gives this report.
- **Fairness and safety:** the same rules as the rest of the AI. It judges only professional content and ignores personal attributes, and text aimed at the AI is ignored and flagged.
- **Privacy:** uploaded files are read and then deleted. Only the report is saved, and only the person who ran the check can see it. Reports can be deleted or printed / saved as PDF.
- **Limit:** `AI_CV_CHECKS_PER_HOUR` (default 30) per user; each check is one AI request.

**AI reports** (`/reports`, `server/src/utils/insights.js` + `assistant.js`):
- **Scope:** one job or all jobs. The **numbers come straight from the database**: totals, pipeline by stage, applications per week, CV-match distribution, automatic decisions, top candidates, people waiting 7+ days, the most common missing skills, time to hire, and upcoming interviews.
- **AI summary:** Gemini adds a headline, what's going well, risks and next steps. It may only use numbers from the data it is given, and notes about candidates who aren't in the report are discarded.
- **Without AI:** reports still work and show the numbers and charts.
- **Charts:** every chart has a "Show as table" view. Reports are saved, so they can be reopened, printed or saved as PDF.
- **Shortcut:** each job page has an **AI report** button.

**Hiring assistant (chatbot)**: the **Ask AI** button on every internal page.
- **What it does:** answers questions like "Who are the best candidates for the Frontend job?" or "Who has been waiting longest?" from live data, with links to the profiles.
- **Read-only by design:** its only tools look data up (`list_jobs`, `get_hiring_stats`, `search_candidates`, `list_upcoming_interviews`). There is no tool that changes anything.
- **Permissions:** tools only see what the signed-in user may see; for example, hiring managers only see their assigned jobs.
- **Privacy:** contact details are never sent to the AI.
- **Safe rendering:** answers are shown with a safe renderer that allows no HTML and only internal links.
- **Limits:** `AI_CHAT_MESSAGES_PER_HOUR` (default 60) and `AI_REPORTS_PER_HOUR` (default 20) per user. The free Gemini tier allows only about 20 requests per model per day, and each chat answer uses 2–4, so use a paid key for real teams.

**Careers site**: a company-style public page.
- **Content:** a headline, an intro and a benefits list, all editable under **Settings → Careers page**.
- **Layout:** a facts panel (open roles, teams, locations), roles grouped by team, job pages with a details sidebar and the application form below the description, and a footer with contact details and an equal-opportunity statement.

**Live CV results for the team**: a bell in the top bar checks for new applications every 15 seconds.
- When a CV arrives, a popup shows the candidate, job, match %, the automatic decision and its reason, with a link to the profile.
- The bell keeps a list of recent results and an unread count.
- The dashboard, candidates list and pipeline refresh on their own.
- Hiring managers only see results for their assigned jobs. Applicants never see screening results.

**Interface**:
- The sidebar shows the company name and logo from Settings.
- **Search everywhere:** `Ctrl/⌘ + K` finds candidates and jobs from any page, with full keyboard support.
- **Candidate profiles** use tabs (Overview, Résumé, Interviews, Notes & feedback, Activity), and links can open a tab directly with `?tab=interviews`.
- **Candidates list:** one search row plus CV filters, with removable filter chips. Several filter changes in quick succession all stick.
- **Responsive:** everything works at phone width, and no page scrolls sideways.
- **Production builds** hide the demo-login hint.

**Rate limits** (per IP, all configurable in the root `.env`):
- Only **failed** sign-ins count (`LOGIN_FAILURES_PER_15_MIN`, default 20), so a team sharing one office IP is never locked out.
- Applications: `APPLICATIONS_PER_HOUR`, default 60.
- Password reset and invites: `ACCOUNT_REQUESTS_PER_15_MIN`, default 30.
- People always see a clear message, never a raw error code.

**Pipeline**: cards can be dragged between columns. Each card also has a "move" menu button, which works with the keyboard (arrow keys, Enter, Esc) and screen readers. Updates show immediately and are rolled back if the save fails.

## Kept out of v1

These were out of scope by design:

- **Automated emails.** Password-reset links are logged on the server and, in development, shown on screen. Invitation links appear in Settings so an admin can copy and share them.
- **AI résumé ranking.** The CV match score is rule-based and explainable. The AI fit score can screen applicants only when a job turns on AI screening.
- **Calendar integration.** Interviews are stored as records (date, time, duration, interviewer, location) and managed from the candidate profile.

## Useful commands

```bash
npm test             # run all tests
npm run seed         # reset the development database to demo data
npm run sample-data  # add sample company info and published jobs without deleting anything
npm run db:down      # stop the development MongoDB (data persists in a Docker volume)
```
