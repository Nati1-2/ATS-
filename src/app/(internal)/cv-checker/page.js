'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, CircleAlert, FileCheck2, Lightbulb, Printer, Sparkles, ThumbsUp, Trash2, TriangleAlert, Upload, X, XCircle } from 'lucide-react';
import { api, useApi } from '@/lib/api';
import { formatBytes, formatDateTime, relativeTime, RESUME_FORMATS } from '@/lib/constants';
import { Alert, Badge, Button, Card, ConfirmDialog, cx, EmptyState, inputClass, LoadingState, PageHeader, Spinner, TextArea, TextInput, useToast } from '@/components/ui';

const SUB_SCORES = [
  ['impact', 'Impact & results'],
  ['clarity', 'Clarity & language'],
  ['structure', 'Structure & layout'],
  ['skills', 'Skills & relevance'],
  ['atsReadability', 'ATS readability'],
];
const PRIORITY = {
  high: 'bg-rose-50 text-rose-800 ring-rose-300',
  medium: 'bg-amber-50 text-amber-800 ring-amber-300',
  low: 'bg-slate-100 text-slate-700 ring-slate-300',
};
const RATING = {
  good: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  ok: 'bg-blue-50 text-blue-800 ring-blue-300',
  weak: 'bg-amber-50 text-amber-800 ring-amber-300',
  missing: 'bg-rose-50 text-rose-800 ring-rose-300',
};
const CHECK_ICON = {
  pass: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Pass" />,
  warn: <TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" aria-label="Warning" />,
  fail: <XCircle className="h-4 w-4 shrink-0 text-rose-600" aria-label="Problem" />,
};

const tone = (score) => (score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-500' : 'text-rose-600');
const bar = (score) => (score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-rose-500');
const verdict = (score) => (score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Needs work' : 'Major issues');

function ScoreRing({ score, label }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-32 w-32 shrink-0" role="img" aria-label={`${label}: ${score} out of 100`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-slate-100" />
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" strokeLinecap="round" stroke="currentColor" className={tone(score)} strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums text-slate-900">{score}</span>
        <span className="text-[11px] font-medium text-slate-500">{verdict(score)}</span>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, iconClass, children, className }) {
  return (
    <Card className={cx('break-inside-avoid', className)}>
      <h2 className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5 text-base font-semibold">
        {Icon && <Icon className={cx('h-4 w-4', iconClass)} aria-hidden />} {title}
      </h2>
      <div className="p-5">{children}</div>
    </Card>
  );
}

/** The full report for one check. */
function Report({ check, onDelete }) {
  const rv = check.review;
  const q = check.quick;
  const score = rv?.overallScore ?? q.score;
  const target = check.jobTitle || check.targetRole;
  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <ScoreRing score={score} label={rv ? 'CV score' : 'Quick check score'} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{rv ? 'AI CV score' : 'Quick check score'}</p>
            <h2 className="mt-1 text-xl font-semibold leading-snug text-slate-900">{rv?.headline || `${q.checks.filter((c) => c.status === 'pass').length} of ${q.checks.length} checks passed`}</h2>
            {rv?.summary && <p className="mt-2 text-sm leading-relaxed text-slate-700">{rv.summary}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {rv?.detectedRole && <Badge className="bg-violet-50 text-violet-800 ring-violet-200">{rv.detectedRole}</Badge>}
              {rv?.seniority && rv.seniority !== 'unclear' && <Badge className="bg-slate-100 text-slate-700 ring-slate-300">{rv.seniority[0].toUpperCase() + rv.seniority.slice(1)} level</Badge>}
              <Badge className="bg-slate-100 text-slate-700 ring-slate-300">{target ? `Target: ${target}` : 'General review'}</Badge>
              {rv && <Badge className="bg-slate-100 text-slate-700 ring-slate-300">Quick checks {q.score}%</Badge>}
            </div>
          </div>
          <div className="flex gap-2 print:hidden sm:flex-col">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden /> Print / PDF
            </Button>
            <Button size="sm" variant="dangerOutline" onClick={onDelete}>
              <Trash2 className="h-4 w-4" aria-hidden /> Delete
            </Button>
          </div>
        </div>
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
          {check.candidateName ? `${check.candidateName} · ` : ''}
          {check.fileName || (check.source === 'paste' ? 'Pasted text' : 'CV')} · checked {formatDateTime(check.createdAt)}
          {check.model ? ` · ${check.model}` : ''}
        </p>
      </Card>

      {check.aiStatus === 'disabled' && <Alert kind="info">AI isn’t set up on this server, so this report has the quick checks only. Add GEMINI_API_KEY to get a full review with comments, rewrites and tips.</Alert>}
      {check.aiStatus === 'failed' && <Alert>The AI review failed: {check.aiError}. The quick checks below still apply.</Alert>}
      {rv?.injectionAttempt && <Alert>This CV contains text aimed at AI or screening systems (for example hidden keywords or “rate this 100”). Recruiters treat that as a red flag: remove it.</Alert>}
      {rv?.readable === false && <Alert>The AI could not read this as a CV.</Alert>}

      {rv && (
        <Section title="Score breakdown">
          <ul className="space-y-4">
            {SUB_SCORES.map(([k, label]) => (
              <li key={k}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-800">{label}</span>
                  <span className={cx('font-semibold tabular-nums', tone(rv.scores[k].score))}>{rv.scores[k].score}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  <div className={cx('h-full rounded-full', bar(rv.scores[k].score))} style={{ width: `${rv.scores[k].score}%` }} />
                </div>
                {rv.scores[k].comment && <p className="mt-1 text-xs text-slate-600">{rv.scores[k].comment}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {rv && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Section title="Strengths" icon={ThumbsUp} iconClass="text-emerald-600">
            {rv.strengths.length ? (
              <ul className="space-y-2 text-sm text-slate-700">
                {rv.strengths.map((s) => (
                  <li key={s} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">None noted.</p>
            )}
          </Section>
          <Section title="Weaknesses" icon={CircleAlert} iconClass="text-rose-600">
            {rv.weaknesses.length ? (
              <ul className="space-y-3">
                {rv.weaknesses.map((w) => (
                  <li key={w.issue} className="text-sm">
                    <p className="font-medium text-slate-900">{w.issue}</p>
                    {w.why && <p className="mt-0.5 text-slate-600">{w.why}</p>}
                    {w.fix && (
                      <p className="mt-1 flex gap-1.5 text-emerald-800">
                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span>
                          <span className="sr-only">Fix: </span>
                          {w.fix}
                        </span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No major weaknesses found.</p>
            )}
          </Section>
        </div>
      )}

      {rv?.suggestions.length > 0 && (
        <Section title="What to improve, in order" icon={Sparkles} iconClass="text-violet-600">
          <ol className="space-y-3">
            {rv.suggestions.map((s, i) => (
              <li key={s.suggestion} className="flex gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700">{i + 1}</span>
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap gap-1.5">
                    <Badge className={PRIORITY[s.priority]}>{s.priority} priority</Badge>
                    <Badge className="bg-slate-100 text-slate-600 ring-slate-200 capitalize">{s.area}</Badge>
                  </div>
                  <p className="text-slate-800">{s.suggestion}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {rv?.rewrites.length > 0 && (
        <Section title="Suggested rewrites">
          <p className="-mt-1 mb-4 text-xs text-slate-500">Lines from the CV, rewritten to show more impact. Replace anything in [brackets] with real numbers.</p>
          <ul className="space-y-4">
            {rv.rewrites.map((r) => (
              <li key={r.original} className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="rounded-lg bg-rose-50/60 p-3 text-sm ring-1 ring-inset ring-rose-100">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-rose-700">Before</p>
                  <p className="text-slate-700">{r.original}</p>
                </div>
                <div className="rounded-lg bg-emerald-50/60 p-3 text-sm ring-1 ring-inset ring-emerald-100">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">After</p>
                  <p className="text-slate-900">{r.improved}</p>
                </div>
                {r.why && <p className="text-xs text-slate-500 md:col-span-2">{r.why}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {rv?.sectionFeedback.length > 0 && (
          <Section title="Section by section">
            <ul className="space-y-3 text-sm">
              {rv.sectionFeedback.map((s) => (
                <li key={s.section}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{s.section}</span>
                    <Badge className={RATING[s.rating]}>{s.rating}</Badge>
                  </div>
                  <p className="mt-0.5 text-slate-600">{s.comment}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}
        <Section title="ATS quick checks" icon={FileCheck2} iconClass="text-blue-600">
          <p className="-mt-1 mb-3 text-xs text-slate-500">Rule-based checks for things applicant tracking systems and recruiters trip over. Score: {q.score}%.</p>
          <ul className="space-y-2.5 text-sm">
            {q.checks.map((c) => (
              <li key={c.id} className="flex gap-2">
                <span className="mt-0.5">{CHECK_ICON[c.status]}</span>
                <span>
                  <span className="font-medium text-slate-900">{c.label}.</span> <span className="text-slate-600">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {(rv?.missingKeywords.length > 0 || q.jobMatch) && (
        <Section title={target ? `Keywords for ${target}` : 'Keywords to consider'}>
          {q.jobMatch && (
            <p className="mb-3 text-sm text-slate-700">
              Rule-based CV match for this job: <strong className={tone(q.jobMatch.score)}>{q.jobMatch.score}%</strong>
              {q.jobMatch.matched.length > 0 && <> · found {q.jobMatch.matched.join(', ')}</>}
            </p>
          )}
          {rv?.missingKeywords.length > 0 && (
            <>
              <p className="mb-2 text-xs text-slate-500">Not shown in the CV. Add the ones you genuinely have, in your experience lines rather than only a skills list.</p>
              <div className="flex flex-wrap gap-1.5">
                {rv.missingKeywords.map((k) => (
                  <Badge key={k} className="bg-amber-50 text-amber-800 ring-amber-200">
                    {k}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </Section>
      )}

      {rv?.tips.length > 0 && (
        <Section title="Quick tips" icon={Lightbulb} iconClass="text-amber-500">
          <ul className="space-y-1.5 text-sm text-slate-700">
            {rv.tips.map((t) => (
              <li key={t} className="flex gap-2">
                <span aria-hidden className="text-amber-500">•</span>
                {t}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {rv && <p className="text-xs text-slate-500">AI feedback can be wrong. It judges only professional content, never personal details. Check every suggestion before using it, and never add skills or numbers that aren’t true.</p>}
    </div>
  );
}

function CheckForm({ applicationId, presetJob, onDone, aiEnabled }) {
  const toast = useToast();
  const router = useRouter();
  const jobs = useApi('/jobs');
  const fileRef = useRef(null);
  const [mode, setMode] = useState('upload');
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [target, setTarget] = useState(presetJob || '');
  const [role, setRole] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const app = useApi(applicationId ? `/applications/${applicationId}/ai` : null); // permission check only
  useEffect(() => setTarget(presetJob || ''), [presetJob]);

  async function submit(e) {
    e.preventDefault();
    setErrors({});
    const fd = new FormData();
    if (applicationId) fd.append('applicationId', applicationId);
    else if (mode === 'upload') {
      if (!file) return setErrors({ resume: 'Choose a CV file' });
      fd.append('resume', file);
    } else {
      if (text.trim().length < 100) return setErrors({ text: 'Paste the whole CV (at least 100 characters)' });
      fd.append('text', text);
    }
    if (target === 'other') fd.append('targetRole', role);
    else if (target) fd.append('jobId', target);
    setBusy(true);
    try {
      const { check } = await api('/cv-checker', { method: 'POST', form: fd });
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setText('');
      onDone(check);
    } catch (err) {
      setErrors(err.fields || {});
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 print:hidden">
      <form onSubmit={submit} noValidate className="space-y-4">
        <h2 className="text-base font-semibold">Check a CV</h2>
        {applicationId ? (
          <div className="flex items-center gap-2 rounded-lg bg-violet-50 p-3 text-sm text-violet-900 ring-1 ring-inset ring-violet-200">
            <FileCheck2 className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">{app.error ? 'You can’t open this applicant.' : 'Checking this applicant’s CV on file.'}</span>
            <button type="button" onClick={() => router.replace('/cv-checker')} className="rounded p-1 hover:bg-violet-100" aria-label="Check a different CV">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div role="radiogroup" aria-label="CV source" className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
              {[
                ['upload', 'Upload file'],
                ['paste', 'Paste text'],
              ].map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)} className={cx('rounded-md px-3 py-1.5 font-medium', mode === v ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900')}>
                  {label}
                </button>
              ))}
            </div>
            {mode === 'upload' ? (
              <div>
                <label
                  htmlFor="cv-file"
                  className={cx(
                    'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm hover:bg-slate-50',
                    errors.resume ? 'border-rose-400' : 'border-slate-300'
                  )}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
                  }}
                >
                  <Upload className="h-5 w-5 text-slate-400" aria-hidden />
                  {file ? (
                    <span className="font-medium text-slate-900">
                      {file.name} <span className="font-normal text-slate-500">· {formatBytes(file.size)}</span>
                    </span>
                  ) : (
                    <span className="font-medium text-blue-700">Choose a file or drop it here</span>
                  )}
                  <span className="text-xs text-slate-500">{RESUME_FORMATS.map((f) => f.ext.slice(1).toUpperCase()).join(', ')}</span>
                </label>
                <input
                  id="cv-file"
                  ref={fileRef}
                  type="file"
                  className="sr-only"
                  accept={RESUME_FORMATS.map((f) => f.ext).join(',')}
                  onChange={(e) => {
                    setFile(e.target.files[0] || null);
                    setErrors({});
                  }}
                />
                {errors.resume && <p className="mt-1 text-xs font-medium text-rose-600">{errors.resume}</p>}
              </div>
            ) : (
              <TextArea id="cv-text" label="CV text" rows={8} value={text} onChange={(e) => setText(e.target.value)} error={errors.text} placeholder="Paste the full CV here…" />
            )}
          </>
        )}
        <div>
          <label htmlFor="cv-target" className="mb-1.5 block text-sm font-medium text-slate-700">
            Compare with
          </label>
          <select id="cv-target" value={target} onChange={(e) => setTarget(e.target.value)} className={inputClass()}>
            <option value="">No specific job (general review)</option>
            {(jobs.data?.jobs || []).map((j) => (
              <option key={j._id} value={j._id}>
                {j.title}
              </option>
            ))}
            <option value="other">Another role…</option>
          </select>
        </div>
        {target === 'other' && <TextInput id="cv-role" label="Role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Data analyst" maxLength={200} />}
        <Button type="submit" loading={busy} className="w-full">
          {!busy && <Sparkles className="h-4 w-4" aria-hidden />} {busy ? 'Reading the CV…' : 'Check CV'}
        </Button>
        {busy && (
          <p role="status" className="flex items-center gap-2 text-xs text-slate-500">
            <Spinner className="h-4 w-4 text-violet-600" /> {aiEnabled ? 'The AI is reviewing the CV. This usually takes 15–40 seconds.' : 'Running the quick checks…'}
          </p>
        )}
        <p className="text-xs text-slate-500">Uploaded files are read and then deleted; only the report is saved, visible to you.</p>
      </form>
    </Card>
  );
}

function History({ checks, activeId }) {
  if (!checks?.length) return null;
  return (
    <Card className="print:hidden">
      <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold">Your recent checks</h2>
      <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
        {checks.map((c) => {
          const score = c.review?.overallScore ?? c.quick?.score;
          return (
            <li key={c._id}>
              <Link href={`/cv-checker?id=${c._id}`} aria-current={c._id === activeId ? 'true' : undefined} className={cx('flex items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50', c._id === activeId && 'bg-violet-50/60')}>
                <span className={cx('w-8 text-right font-semibold tabular-nums', tone(score))}>{score}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900">{c.candidateName || c.fileName || 'Pasted CV'}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {c.jobTitle || c.targetRole || 'General review'} · {relativeTime(c.createdAt)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function CvChecker() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const id = params.get('id');
  const applicationId = params.get('application');
  const presetJob = params.get('job') || '';
  const history = useApi('/cv-checker');
  const current = useApi(id ? `/cv-checker/${id}` : null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const check = id ? current.data?.check : null;

  async function remove() {
    setDeleting(true);
    try {
      await api(`/cv-checker/${id}`, { method: 'DELETE' });
      toast('Check deleted');
      setConfirmDelete(false);
      history.reload();
      router.replace('/cv-checker');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader title="CV checker" description="Get a score, strengths, weaknesses and specific fixes for any CV, compared with one of your jobs or reviewed in general." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <CheckForm
            applicationId={applicationId}
            presetJob={presetJob}
            aiEnabled={history.data?.aiEnabled}
            onDone={(c) => {
              history.reload();
              router.push(`/cv-checker?id=${c._id}`);
            }}
          />
          <History checks={history.data?.checks} activeId={id} />
        </div>
        <div className="min-w-0 lg:col-span-2">
          {!id ? (
            <Card>
              <EmptyState
                icon={FileCheck2}
                title="Your report will appear here"
                description="Upload a CV or paste its text. You’ll get an overall score, a breakdown, strengths and weaknesses, rewrites of weak lines, missing keywords and quick ATS checks."
              />
            </Card>
          ) : current.loading && !check ? (
            <LoadingState label="Loading report…" />
          ) : current.error ? (
            <Alert>{current.error.message}</Alert>
          ) : (
            check && <Report check={check} onDelete={() => setConfirmDelete(true)} />
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        loading={deleting}
        danger
        title="Delete this check?"
        message="The report will be removed from your history."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </>
  );
}

export default function CvCheckerPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <CvChecker />
    </Suspense>
  );
}
