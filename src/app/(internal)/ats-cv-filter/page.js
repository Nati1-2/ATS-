'use client';

import Link from 'next/link';
import { Suspense, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Filter, Lightbulb, Upload, XCircle, AlertTriangle } from 'lucide-react';
import { api, qs, useApi, useOnNewApplications, useQueryUpdater } from '@/lib/api';
import { formatBytes, formatDate, RESUME_FORMATS, STAGES } from '@/lib/constants';
import { useAuth } from '@/components/AuthProvider';
import { Alert, Avatar, Badge, Button, Card, cx, EmptyState, ErrorState, inputClass, LoadingState, MatchMeter, matchTone, PageHeader, StageBadge, Tabs, useToast } from '@/components/ui';

// Rule-based checks from utils/cvChecker.js quickChecks() that a CV can be required to pass
const MUST_PASS = [
  { id: 'readable', label: 'Text can be read' },
  { id: 'contact', label: 'Contact details' },
  { id: 'sections', label: 'Standard section headings' },
  { id: 'dates', label: 'Dates for each role' },
  { id: 'impact', label: 'Measurable results' },
  { id: 'keywords', label: 'Job keywords' },
  { id: 'format', label: 'File format' },
];

// ATS decision from utils/atsScore.js
const DECISION = {
  pass: { label: 'Passed', badge: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
  review: { label: 'Needs review', badge: 'bg-amber-50 text-amber-800 ring-amber-300' },
  reject: { label: 'Rejected', badge: 'bg-rose-50 text-rose-800 ring-rose-300' },
};

const DecisionTag = ({ decision }) => <Badge className={DECISION[decision].badge}>ATS: {DECISION[decision].label}</Badge>;

function Stat({ label, value, hint }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value ?? '—'}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

/** Weaknesses ranked by the points fixing them would add, each with how to fix it. */
function Improvements({ items }) {
  if (!items.length) return <p className="text-sm font-medium text-emerald-700">No weaknesses found. This CV is ready for an ATS.</p>;
  return (
    <ol className="space-y-2">
      {items.map((i, n) => (
        <li key={i.id} className={cx('rounded-lg p-3 ring-1 ring-inset', i.severity === 'high' ? 'bg-rose-50/60 ring-rose-200' : 'bg-amber-50/60 ring-amber-200')}>
          <div className="flex items-start gap-2">
            <span className="mt-px text-xs font-semibold tabular-nums text-slate-500">{n + 1}.</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{i.area}</span>
                {i.knockout && <Badge className="bg-rose-100 text-rose-800 ring-rose-300">Knockout</Badge>}
                <span className="ml-auto text-xs font-semibold text-emerald-700" title="Approximate points this fix adds to the ATS score">
                  +{i.gain} pts
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-900">{i.problem}</p>
              {i.fix && (
                <p className="mt-1 flex gap-1.5 text-sm text-slate-700">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                  <span>
                    <span className="font-medium">How to improve:</span> {i.fix}
                  </span>
                </p>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** What the ATS score is made of, and which keywords were found. */
function Breakdown({ components, keywords }) {
  return (
    <>
      {components.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {components.map((c) => (
            <li key={c.key} className="rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-900">{c.label}</p>
                <span className="text-xs text-slate-500">{c.weight}% of score</span>
              </div>
              <div className="mt-1">
                <MatchMeter score={c.score} srLabel={false} />
              </div>
              <p className="mt-1 text-xs text-slate-600">{c.detail}</p>
            </li>
          ))}
        </ul>
      )}

      {keywords && (
        <div className="mt-3 space-y-1.5 text-sm">
          <p className="text-xs font-medium text-slate-600">
            Keywords from the job ad · {keywords.found.length} of {keywords.found.length + keywords.missing.length} found
          </p>
          <div className="flex flex-wrap gap-1">
            {keywords.found.map((k) => (
              <Badge key={k} className="bg-emerald-50 text-emerald-800 ring-emerald-200">
                {k}
              </Badge>
            ))}
            {keywords.missing.map((k) => (
              <Badge key={k} className="bg-slate-100 text-slate-500 ring-slate-200 line-through">
                {k}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const CHECK_ICON = {
  pass: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />,
  warn: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />,
  fail: <XCircle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden />,
};

/** Upload one CV and see how it does on the ATS rules. The file is read on the server and not kept. */
function UploadCheck({ jobs }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [jobId, setJobId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!file) return setError('Choose a CV file');
    const fd = new FormData();
    fd.append('resume', file);
    if (jobId) fd.append('jobId', jobId);
    setBusy(true);
    try {
      setResult((await api('/ats-cv-filter/check', { method: 'POST', form: fd })).result);
    } catch (err) {
      setError(err.fields?.resume || '');
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4 p-5">
      <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_16rem_auto] lg:items-end">
        <div>
          <p className="mb-1 block text-xs font-medium text-slate-600">Upload a CV</p>
          <label
            htmlFor="ats-file"
            className={cx('flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed px-3 py-2 text-sm hover:bg-slate-50', error ? 'border-rose-400' : 'border-slate-300')}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
            }}
          >
            <Upload className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            {file ? (
              <span className="truncate font-medium text-slate-900">
                {file.name} <span className="font-normal text-slate-500">· {formatBytes(file.size)}</span>
              </span>
            ) : (
              <span className="truncate">
                <span className="font-medium text-blue-700">Choose a file or drop it here</span>{' '}
                <span className="text-xs text-slate-500">({RESUME_FORMATS.map((f) => f.ext.slice(1).toUpperCase()).join(', ')})</span>
              </span>
            )}
          </label>
          <input
            id="ats-file"
            ref={fileRef}
            type="file"
            className="sr-only"
            accept={RESUME_FORMATS.map((f) => f.ext).join(',')}
            onChange={(e) => {
              setFile(e.target.files[0] || null);
              setError('');
            }}
          />
          {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
        </div>
        <div>
          <label htmlFor="ats-job" className="mb-1 block text-xs font-medium text-slate-600">
            Check keywords for
          </label>
          <select id="ats-job" value={jobId} onChange={(e) => setJobId(e.target.value)} className={inputClass()}>
            <option value="">No specific job</option>
            {jobs.map((j) => (
              <option key={j._id} value={j._id}>
                {j.title}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" loading={busy} className="h-[38px]">
          Run ATS check
        </Button>
      </form>

      {result && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className={cx('rounded-xl px-3 py-2 text-2xl font-bold tabular-nums ring-1 ring-inset', matchTone(result.score))}>{result.score}%</span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                {result.grade} <DecisionTag decision={result.decision} />
              </p>
              <p className="truncate text-xs text-slate-500">
                {result.fileName}
                {result.jobTitle && ` · for ${result.jobTitle}`}
              </p>
            </div>
          </div>

          {result.decision === 'review' && result.holds?.length > 0 && <p className="mt-3 text-sm font-medium text-amber-700">Not passed automatically: {result.holds.join(' · ')}</p>}

          {result.knockouts.length > 0 && (
            <div className="mt-3">
              <Alert>
                {result.knockouts.map((k) => (
                  <p key={k}>{k}</p>
                ))}
              </Alert>
            </div>
          )}

          <Breakdown components={result.components} keywords={result.keywords} />

          <h3 className="mb-2 mt-4 text-sm font-semibold text-slate-900">Weaknesses and how to improve</h3>
          <Improvements items={result.improvements} />

          <h3 className="mb-2 mt-4 text-sm font-semibold text-slate-900">All ATS checks</h3>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {result.checks.map((c) => (
              <li key={c.id} className="flex gap-2 rounded-lg bg-slate-50 p-3 text-sm ring-1 ring-inset ring-slate-200">
                {CHECK_ICON[c.status]}
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{c.label}</p>
                  <p className="text-xs text-slate-600">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function AtsCvFilter() {
  const { user } = useAuth();
  const params = useSearchParams();
  const setQuery = useQueryUpdater();
  const job = params.get('job') || '';
  const minAts = params.get('minAts') || '';
  const mustPass = params.get('mustPass') || '';
  const result = params.get('result') || '';
  const sort = params.get('sort') || '';
  const page = Number(params.get('page')) || 1;
  const update = (patch) => setQuery({ page: undefined, ...patch });

  const isAdmin = user?.role === 'admin';
  const jobs = useApi(isAdmin ? '/jobs' : null);
  const { data, error, loading, reload } = useApi(isAdmin ? `/ats-cv-filter${qs({ job, result, minAts, mustPass, sort, page })}` : null);
  useOnNewApplications(reload);

  if (!isAdmin) return <Alert>Only admins can use the ATS CV Filter.</Alert>;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const filtered = Boolean(job || result || minAts || mustPass);

  return (
    <div>
      <PageHeader
        title="ATS CV Filter"
        description="Rate an uploaded CV or filter applicants the way an ATS does: requirements and job-ad keywords first, then parseability and content. Rules only, no AI."
      />

      <UploadCheck jobs={jobs.data?.jobs ?? []} />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="CVs scanned" value={data?.scanned} hint={data?.capped ? 'Most recent applications only' : undefined} />
        <Stat label="Passed ATS" value={data?.decisions.pass} hint="75%+, no knockouts, enough detail" />
        <Stat label="Rejected by ATS" value={data?.decisions.reject} hint="Knockout or under 50%" />
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="filter-job" className="mb-1 block text-xs font-medium text-slate-600">
              Job
            </label>
            <select id="filter-job" value={job} onChange={(e) => update({ job: e.target.value })} className={inputClass()}>
              <option value="">All jobs</option>
              {jobs.data?.jobs.map((j) => (
                <option key={j._id} value={j._id}>
                  {j.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-min" className="mb-1 block text-xs font-medium text-slate-600">
              Minimum ATS score
            </label>
            <select id="filter-min" value={minAts} onChange={(e) => update({ minAts: e.target.value })} className={inputClass()}>
              <option value="">Any score</option>
              {[90, 75, 50, 25].map((n) => (
                <option key={n} value={n}>
                  {n}% or more
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-pass" className="mb-1 block text-xs font-medium text-slate-600">
              Must pass
            </label>
            <select id="filter-pass" value={mustPass} onChange={(e) => update({ mustPass: e.target.value })} className={inputClass()}>
              <option value="">Any check</option>
              {MUST_PASS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-sort" className="mb-1 block text-xs font-medium text-slate-600">
              Sort by
            </label>
            <select id="filter-sort" value={sort} onChange={(e) => update({ sort: e.target.value })} className={inputClass()}>
              <option value="">Newest first</option>
              <option value="ats">Best ATS score first</option>
              <option value="keywords">Best requirements match first</option>
            </select>
          </div>
        </div>

        <div className="px-4">
          <Tabs
            label="ATS result"
            value={result || 'all'}
            onChange={(id) => update({ result: id === 'all' ? '' : id })}
            tabs={[
              { id: 'all', label: 'All', count: data?.counted },
              ...Object.entries(DECISION).map(([id, d]) => ({ id, label: d.label, count: data?.decisions[id] })),
            ]}
          />
        </div>

        {loading && !data ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : data.applications.length === 0 ? (
          <EmptyState
            icon={Filter}
            title={filtered ? 'No CVs match these filters' : 'No CVs yet'}
            description={filtered ? 'Try a lower score or a different check.' : 'Applications submitted on the careers page will appear here.'}
            action={
              filtered && (
                <Button variant="secondary" onClick={() => update({ job: '', result: '', minAts: '', mustPass: '' })}>
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <>
            <ul className={cx('divide-y divide-slate-100', loading && 'opacity-60')}>
              {data.applications.map((a) => (
                <li key={a._id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Avatar name={a.candidate.fullName} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/candidates/${a.candidate._id}?application=${a._id}`} className="font-medium text-slate-900 hover:text-blue-700 hover:underline">
                        {a.candidate.fullName}
                      </Link>
                      <p className="truncate text-xs text-slate-500">
                        {a.job?.title ?? 'Job removed'} · {formatDate(a.createdAt)}
                        {a.fileName && ` · ${a.fileName}`}
                      </p>
                      {a.knockouts.length > 0 && <p className="mt-1.5 text-xs font-medium text-rose-700">{a.knockouts.join(' · ')}</p>}
                      {a.decision === 'review' && a.holds?.length > 0 && <p className="mt-1.5 text-xs font-medium text-amber-700">Not passed automatically: {a.holds.join(' · ')}</p>}
                      <details className="group mt-2">
                        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
                          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
                          Score breakdown · {a.improvements.length ? `${a.improvements.length} weakness${a.improvements.length === 1 ? '' : 'es'} · how to improve` : 'no weaknesses found'}
                        </summary>
                        <Breakdown components={a.components} keywords={a.keywords} />
                        <div className="mt-3">
                          <Improvements items={a.improvements} />
                        </div>
                      </details>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <DecisionTag decision={a.decision} />
                    <Badge className={matchTone(a.atsScore)}>
                      {a.atsScore}% · {a.grade}
                    </Badge>
                    {a.keywordScore != null && <span className="text-xs text-slate-500">Requirements</span>}
                    <MatchMeter score={a.keywordScore} />
                    {STAGES.some((s) => s.value === a.stage) && <StageBadge stage={a.stage} />}
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
              <span>
                {data.total} CV{data.total === 1 ? '' : 's'}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => update({ page: page - 1 })} aria-label="Previous page">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span>
                    Page {page} of {totalPages}
                  </span>
                  <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => update({ page: page + 1 })} aria-label="Next page">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

export default function AtsCvFilterPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AtsCvFilter />
    </Suspense>
  );
}
