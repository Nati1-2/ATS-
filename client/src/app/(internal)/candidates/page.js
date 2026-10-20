'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, FileSearch, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import { qs, useApi, useLeaveGuard, useOnNewApplications, useQueryUpdater } from '@/lib/api';
import { AI_ACTIONS, formatDate, STAGES } from '@/lib/constants';
import { Avatar, Badge, Button, Card, cx, DecisionBadge, MatchMeter, ScreeningFailedBadge, EmptyState, ErrorState, inputClass, LoadingState, PageHeader, StageBadge } from '@/components/ui';

function CandidatesList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const job = params.get('job') || '';
  const stage = params.get('stage') || '';
  const page = Number(params.get('page')) || 1;
  const minScore = params.get('minScore') || '';
  const screening = params.get('screening') || '';
  const sort = params.get('sort') || '';
  const decision = params.get('decision') || '';
  const [q, setQ] = useState(params.get('q') || '');
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [kw, setKw] = useState(params.get('keywords') || '');
  const [debouncedKw, setDebouncedKw] = useState(kw);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKw(kw), 400);
    return () => clearTimeout(t);
  }, [kw]);

  const { leaving, onClickCapture } = useLeaveGuard();
  const setQuery = useQueryUpdater();
  const update = (patch) => {
    if (leaving.current) return; // user already clicked through to a profile
    const next = { q: debouncedQ, keywords: debouncedKw, page: undefined, ...patch };
    if (next.page === 1) next.page = undefined;
    setQuery(next); // keeps every other filter, even if several change quickly
  };

  useEffect(() => {
    if (debouncedQ !== (params.get('q') || '') || debouncedKw !== (params.get('keywords') || '')) update({ q: debouncedQ, keywords: debouncedKw });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, debouncedKw]);

  const jobs = useApi('/jobs');
  const { data, error, loading, reload } = useApi(`/candidates${qs({ q: params.get('q') || '', keywords: params.get('keywords') || '', job, stage, minScore, screening, decision, sort, page })}`);
  useOnNewApplications(reload);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const filtered = Boolean(params.get('q') || params.get('keywords') || job || stage || minScore || screening || decision);
  const advancedCount = [params.get('keywords'), minScore, screening, decision].filter(Boolean).length;
  const [showMore, setShowMore] = useState(advancedCount > 0);
  const jobTitle = jobs.data?.jobs.find((j) => j._id === job)?.title;
  const clearAll = () => {
    setQ('');
    setDebouncedQ('');
    setKw('');
    setDebouncedKw('');
    router.replace(pathname);
  };
  const chips = [
    params.get('q') && { key: 'q', label: `“${params.get('q')}”`, clear: () => (setQ(''), setDebouncedQ(''), update({ q: '' })) },
    job && { key: 'job', label: `Job: ${jobTitle ?? '…'}`, clear: () => update({ job: '' }) },
    stage && { key: 'stage', label: `Stage: ${STAGES.find((s) => s.value === stage)?.label}`, clear: () => update({ stage: '' }) },
    params.get('keywords') && { key: 'kw', label: `CV contains: ${params.get('keywords')}`, clear: () => (setKw(''), setDebouncedKw(''), update({ keywords: '' })) },
    minScore && { key: 'min', label: `Match ≥ ${minScore}%`, clear: () => update({ minScore: '' }) },
    screening && { key: 'scr', label: screening === 'passed' ? 'Passed screening' : 'Failed screening', clear: () => update({ screening: '' }) },
    decision && { key: 'dec', label: { advanced: 'Auto-shortlisted', review: 'Needs review', rejected: 'Auto-rejected' }[decision], clear: () => update({ decision: '' }) },
  ].filter(Boolean);

  return (
    <div onClickCapture={onClickCapture}>
      <PageHeader title="Candidates" description="Every application with its own hiring stage. Filter by CV content, match score, and screening results." />
      <Card>
        <div className="space-y-3 border-b border-slate-200 p-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <label htmlFor="cand-search" className="sr-only">
                Search by name or email
              </label>
              <input id="cand-search" type="search" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} className={cx(inputClass(), 'pl-9')} />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:flex">
              <div className="sm:w-52">
                <label htmlFor="cand-job" className="sr-only">
                  Filter by job
                </label>
                <select id="cand-job" value={job} onChange={(e) => update({ job: e.target.value })} className={inputClass()}>
                  <option value="">All jobs</option>
                  {jobs.data?.jobs.map((j) => (
                    <option key={j._id} value={j._id}>
                      {j.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:w-40">
                <label htmlFor="cand-stage" className="sr-only">
                  Filter by stage
                </label>
                <select id="cand-stage" value={stage} onChange={(e) => update({ stage: e.target.value })} className={inputClass()}>
                  <option value="">All stages</option>
                  {STAGES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="secondary"
                onClick={() => setShowMore((v) => !v)}
                aria-expanded={showMore}
                aria-controls="cand-more-filters"
                className={cx('h-[38px]', advancedCount > 0 && 'ring-blue-300 text-blue-700')}
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                CV filters{advancedCount > 0 && <span className="rounded-full bg-blue-600 px-1.5 text-[11px] text-white">{advancedCount}</span>}
              </Button>
              <div className="sm:w-44">
                <label htmlFor="cand-sort" className="sr-only">
                  Sort by
                </label>
                <select id="cand-sort" value={sort} onChange={(e) => update({ sort: e.target.value })} className={inputClass()}>
                  <option value="">Newest first</option>
                  <option value="score">Best match first</option>
                </select>
              </div>
            </div>
          </div>

          {showMore && (
            <div id="cand-more-filters" className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-200 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="cand-keywords" className="mb-1 block text-xs font-medium text-slate-600">
                  Search inside CVs
                </label>
                <div className="relative">
                  <FileSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                  <input id="cand-keywords" type="search" placeholder="e.g. react, aws" value={kw} onChange={(e) => setKw(e.target.value)} className={cx(inputClass(), 'pl-9')} />
                </div>
              </div>
              <div>
                <label htmlFor="cand-score" className="mb-1 block text-xs font-medium text-slate-600">
                  Minimum CV match
                </label>
                <select id="cand-score" value={minScore} onChange={(e) => update({ minScore: e.target.value })} className={inputClass()}>
                  <option value="">Any match</option>
                  {[90, 75, 50, 25].map((n) => (
                    <option key={n} value={n}>
                      {n}% or more
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="cand-screening" className="mb-1 block text-xs font-medium text-slate-600">
                  Screening questions
                </label>
                <select id="cand-screening" value={screening} onChange={(e) => update({ screening: e.target.value })} className={inputClass()}>
                  <option value="">Any result</option>
                  <option value="passed">Passed screening</option>
                  <option value="failed">Failed screening</option>
                </select>
              </div>
              <div>
                <label htmlFor="cand-decision" className="mb-1 block text-xs font-medium text-slate-600">
                  Automatic decision
                </label>
                <select id="cand-decision" value={decision} onChange={(e) => update({ decision: e.target.value })} className={inputClass()}>
                  <option value="">Any decision</option>
                  <option value="advanced">Auto-shortlisted</option>
                  <option value="review">Needs review</option>
                  <option value="rejected">Auto-rejected</option>
                </select>
              </div>
            </div>
          )}

          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
              {chips.map((c) => (
                <span key={c.key} className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-2.5 pr-1 text-xs font-medium text-blue-800 ring-1 ring-inset ring-blue-200">
                  {c.label}
                  <button type="button" onClick={c.clear} aria-label={`Remove filter: ${c.label}`} className="rounded-full p-0.5 hover:bg-blue-100">
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </span>
              ))}
              <button type="button" onClick={clearAll} className="text-xs font-medium text-slate-500 hover:text-slate-900 hover:underline">
                Clear all
              </button>
            </div>
          )}
        </div>

        {loading && !data ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : data.applications.length === 0 ? (
          <EmptyState
            icon={Users}
            title={filtered ? 'No candidates match your filters' : 'No candidates yet'}
            description={filtered ? 'Try a different search, job, or stage.' : 'Applications submitted on the careers page will appear here.'}
            action={
              filtered && (
                <Button
                  variant="secondary"
                  onClick={clearAll}
                >
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <>
            {/* Table on larger screens */}
            <div className={cx('relative hidden overflow-x-auto md:block', loading && 'opacity-60')}>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Candidate</th>
                    <th scope="col" className="px-4 py-3 font-medium">Job applied for</th>
                    <th scope="col" className="px-4 py-3 font-medium">Applied</th>
                    <th scope="col" className="px-4 py-3 font-medium">CV screening</th>
                    <th scope="col" className="px-4 py-3 font-medium">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.applications.map((a) => (
                    <tr key={a._id} className="relative hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={a.candidate.fullName} />
                          <div className="min-w-0">
                            <Link href={`/candidates/${a.candidate._id}`} className="font-medium text-slate-900 after:absolute after:inset-0 hover:text-blue-700">
                              {a.candidate.fullName}
                            </Link>
                            <p className="truncate text-xs text-slate-500">{a.candidate.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{a.job.title}</td>
                      <td className="px-4 py-3 text-slate-700">{formatDate(a.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <MatchMeter score={a.match?.score} />
                          {AI_ACTIONS[a.aiScreen?.action] && a.aiScreen.action !== 'review' ? (
                            <Badge className={AI_ACTIONS[a.aiScreen.action].badge}>{AI_ACTIONS[a.aiScreen.action].label}</Badge>
                          ) : a.autoDecision && a.autoDecision !== 'review' ? (
                            <DecisionBadge decision={a.autoDecision} />
                          ) : (
                            a.screeningPassed === false && <ScreeningFailedBadge />
                          )}
                          {a.ai?.status === 'done' && (
                            <Badge className="bg-violet-50 text-violet-800 ring-violet-200" title={`AI fit ${a.ai.fitScore ?? ''}%`}>
                              AI: {a.ai.fitLevel}
                              {a.ai.fitScore != null && ` · ${a.ai.fitScore}%`}
                            </Badge>
                          )}
                          {a.match?.score == null && a.screeningPassed !== false && !a.autoDecision && <span className="text-slate-400">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StageBadge stage={a.stage} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Cards on mobile */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {data.applications.map((a) => (
                <li key={a._id}>
                  <Link href={`/candidates/${a.candidate._id}`} className="flex items-start gap-3 p-4 hover:bg-slate-50">
                    <Avatar name={a.candidate.fullName} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{a.candidate.fullName}</p>
                      <p className="truncate text-xs text-slate-500">{a.candidate.email}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {a.job.title} · {formatDate(a.createdAt)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <MatchMeter score={a.match?.score} />
                        {a.autoDecision && a.autoDecision !== 'review' ? <DecisionBadge decision={a.autoDecision} /> : a.screeningPassed === false && <ScreeningFailedBadge />}
                      </div>
                    </div>
                    <StageBadge stage={a.stage} />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
              <span>
                {data.total} application{data.total === 1 ? '' : 's'}
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

export default function CandidatesPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <CandidatesList />
    </Suspense>
  );
}
