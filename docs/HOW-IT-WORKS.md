# How it works

Detailed reference for every feature: data model, permissions, CV screening, AI, careers site and interface. Back to the [README](../README.md).

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
| 11 | AI screening (review AI decisions) | `/ai-screening` |
| 12 | CV checker | `/cv-checker` |
| 13 | AI reports | `/reports` |
| 14 | AI assistant (full page) | `/assistant` |
| 15 | Job seeker CV check | `/check-cv` |
| 16 | Job seeker sign up / sign in, dashboard, full report, upgrade | `/my/signup`, `/my/login`, `/my`, `/my/checks/:id`, `/my/upgrade` |
| 17 | Payments (admins approve job seekers' upgrades) | `/payments` |


**Data model** (`server/src/models/index.js`): `User`, `Invite`, `Company`, `Job`, `Candidate`, `Application`, `Note` (internal notes and hiring-manager feedback), `Interview`, and `Activity`. Job seekers have their own `Seeker`, `SeekerCheck` and `Payment` collections.

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
  - The Candidates page can search *inside CVs* (comma-separated terms must all appear), filter by minimum match %, minimum AI fit % and screening pass/fail, and sort by best match or best AI fit.
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

**Job seeker CV check and upgrade** (`/check-cv`, `/my`, `server/src/routes/seeker.js`): the same CV review, for job seekers on the public site.
- **Flow:** upload a CV at `/check-cv` (no account needed) → sign up or sign in → the dashboard at `/my` shows the **score only**, plus the jobs they applied for → **Improve my CV** opens `/my/upgrade`, which shows the Payoneer email to pay → they enter the transaction ID and click **I've paid** → an admin approves it on **Payments** (`/payments`, admins only) → the full report (fixes, rewrites, keywords, quick checks) unlocks for every CV they check.
- **Accounts:** job seekers are a separate `Seeker` collection with their own `seeker_token` cookie, so a seeker session can never reach the hiring API. A CV checked before sign-up is held with a short-lived claim cookie and attached to the account on sign-up or sign-in.
- **Locked reports:** until the payment is approved, the API sends only the score, never the review itself.
- **Applications:** jobs applied for while signed in as a seeker are linked to the account and shown with applicant-friendly statuses (Under review, Interview, Offer, Hired, Not selected). Earlier applications are not matched by email, because seeker emails are not verified.
- **Payment:** manual. Nothing is charged by the app; an admin checks that the money arrived in Payoneer before approving. Configure with `PAYONEER_EMAIL` (default `natnaelsolomon571@gmail.com`), `CV_UPGRADE_PRICE` (default `10`) and `CV_UPGRADE_CURRENCY` (default `USD`).
- **Limit:** `SEEKER_CV_CHECKS_PER_HOUR` (default 10) per IP address, because checks work signed out.

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
- **Fully automatic AI decisions by default.** The AI fit score can be used to filter and sort candidates, but it only rejects or shortlists people when a job turns on AI screening.
- **Calendar integration.** Interviews are stored as records (date, time, duration, interviewer, location) and managed from the candidate profile.

## Useful commands

```bash
npm test             # run all tests
npm run seed         # reset the development database to demo data
npm run sample-data  # add sample company info and published jobs without deleting anything
npm run db:down      # stop the development MongoDB (data persists in a Docker volume)
```
