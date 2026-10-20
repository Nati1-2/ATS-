'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Search, ShieldCheck, Undo2, XCircle } from 'lucide-react';
import { api, qs, useApi, useOnNewApplications, useQueryUpdater, AI_SCREENING_CHANGED_EVENT } from '@/lib/api';
import { AI_ACTIONS, AI_SCREEN_MODE_MAP, canManage, relativeTime } from '@/lib/constants';
import { useAuth } from '@/components/AuthProvider';
import { Alert, Avatar, Badge, Button, Card, ConfirmDialog, cx, EmptyState, ErrorState, inputClass, LoadingState, MatchMeter, matchTone, PageHeader, StageBadge, Tabs, useToast } from '@/components/ui';

const VIEWS = [
  { id: 'pending', label: 'Awaiting confirmation', empty: 'No AI rejections are waiting for you.' },
  { id: 'rejected', label: 'Rejected by AI', empty: 'The AI has not rejected anyone you haven’t reviewed.' },
  { id: 'advanced', label: 'Shortlisted by AI', empty: 'The AI has not shortlisted anyone you haven’t reviewed.' },
  { id: 'flagged', label: 'Flagged for a person', empty: 'Nothing the AI held back for a person.' },
  { id: 'reviewed', label: 'Reviewed', empty: 'No AI decisions have been reviewed yet.' },
];

// What "confirm" and "overturn" mean in each view
const ACTIONS = {
  pending: { confirm: 'Reject', overturn: 'Keep in Applied', confirmTone: 'danger' },
  rejected: { confirm: 'Confirm rejection', overturn: 'Reinstate', confirmTone: 'secondary' },
  advanced: { confirm: 'Confirm shortlist', overturn: 'Move back to Applied', confirmTone: 'secondary' },
};

function Stat({ label, value, hint, tone }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={cx('mt-1 text-2xl font-semibold tabular-nums', tone)}>{value ?? '—'}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

function Row({ item, view, selectable, selected, onSelect, onReview, busy }) {
  const d = item.aiScreen || {};
  const actions = ACTIONS[view];
  return (
    <li className="flex gap-3 p-4 sm:p-5">
      {selectable && (
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-violet-600"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          aria-label={`Select ${item.candidate?.fullName}`}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Avatar name={item.candidate?.fullName} className="h-8 w-8 text-xs" />
          <div className="min-w-0">
            <Link href={`/candidates/${item.candidate?._id}?tab=overview`} className="block truncate font-medium text-slate-900 hover:text-blue-700 hover:underline">
              {item.candidate?.fullName}
            </Link>
            <p className="truncate text-xs text-slate-500">{item.job?.title}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {d.fitScore != null && (
              <Badge className={matchTone(d.fitScore)}>
                <span className="sr-only">AI fit </span>AI {d.fitScore}%
              </Badge>
            )}
            <MatchMeter score={item.match?.score} />
            <StageBadge stage={item.stage} />
          </div>
        </div>
        {d.reasons?.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-sm text-slate-700">
            {d.reasons.map((r) => (
              <li key={r} className="flex gap-2">
                <span aria-hidden className="text-slate-400">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-500">
          {view === 'reviewed' ? (
            <>
              <Badge className={AI_ACTIONS[d.action]?.badge}>{AI_ACTIONS[d.action]?.label}</Badge>
              <Badge className={d.review.outcome === 'confirmed' ? 'bg-slate-100 text-slate-700 ring-slate-300' : 'bg-amber-50 text-amber-800 ring-amber-300'}>
                {d.review.outcome === 'confirmed' ? 'Confirmed' : 'Overturned'}
              </Badge>
              <span>
                by {d.review.byName} {relativeTime(d.review.at)}
              </span>
            </>
          ) : (
            <span>
              Decided {relativeTime(d.decidedAt)} · {AI_SCREEN_MODE_MAP[d.mode]?.short ?? ''} mode
            </span>
          )}
          {actions && onReview && (
            <span className="flex flex-wrap gap-2 sm:ml-auto">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => onReview([item._id], 'overturned')}>
                <Undo2 className="h-3.5 w-3.5" aria-hidden /> {actions.overturn}
              </Button>
              <Button size="sm" variant={actions.confirmTone} disabled={busy} onClick={() => onReview([item._id], 'confirmed')}>
                {view === 'pending' ? <XCircle className="h-3.5 w-3.5" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />} {actions.confirm}
              </Button>
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function AiScreening() {
  const { user } = useAuth();
  const toast = useToast();
  const params = useSearchParams();
  const setQuery = useQueryUpdater();
  const view = VIEWS.some((v) => v.id === params.get('view')) ? params.get('view') : 'pending';
  const job = params.get('job') || '';
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(null);
  const manager = canManage(user);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setSelected(new Set()), [view, job, debouncedQ]);

  const { data, error, loading, reload } = useApi(`/ai-screening${qs({ view, job, q: debouncedQ })}`);
  useOnNewApplications(reload);

  async function review(ids, outcome) {
    setBusy(true);
    try {
      const r = await api('/ai-screening/review', { method: 'POST', body: { ids, outcome } });
      const verb = outcome === 'confirmed' ? 'Confirmed' : 'Overturned';
      toast(r.skipped ? `${verb} ${r.updated}; ${r.skipped} had already been handled` : `${verb} ${r.updated} AI decision${r.updated === 1 ? '' : 's'}`);
      setSelected(new Set());
      setConfirmBulk(null);
      window.dispatchEvent(new Event(AI_SCREENING_CHANGED_EVENT));
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const items = data?.items ?? [];
  const counts = data?.counts ?? {};
  const jobs = data?.jobs ?? [];
  const aiJobs = jobs.filter((j) => j.aiScreen?.mode && j.aiScreen.mode !== 'off');
  const actions = ACTIONS[view];
  const selectable = manager && Boolean(actions);
  const allSelected = items.length > 0 && items.every((i) => selected.has(i._id));
  const rejectAcc = data?.accuracy?.reject;
  const current = VIEWS.find((v) => v.id === view);

  return (
    <>
      <PageHeader
        title="AI screening"
        description="Decisions the AI made from each CV. Confirm them, or overturn anything it got wrong. Every decision lists its reasons."
        actions={
          <select aria-label="Filter by job" value={job} onChange={(e) => setQuery({ job: e.target.value || undefined })} className={cx(inputClass(), 'w-full sm:w-64')}>
            <option value="">All jobs</option>
            {jobs.map((j) => (
              <option key={j._id} value={j._id}>
                {j.title} · AI {AI_SCREEN_MODE_MAP[j.aiScreen?.mode || 'off'].short.toLowerCase()}
              </option>
            ))}
          </select>
        }
      />

      {data && aiJobs.length === 0 && (
        <div className="mb-6">
          <Alert kind="info">
            AI screening is off for every job, so the AI only writes summaries. To let it reject or shortlist, edit a job and choose <strong>Recommend</strong> or <strong>Automatic</strong> under AI screening.
          </Alert>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Awaiting confirmation" value={counts.pending} tone={counts.pending ? 'text-violet-700' : 'text-slate-900'} hint="AI recommends rejecting" />
        <Stat label="Rejected by AI" value={counts.rejected} hint="Not yet reviewed" />
        <Stat label="Shortlisted by AI" value={counts.advanced} hint="Moved to Screening" />
        <Stat
          label="Rejections overturned"
          value={rejectAcc?.overturnRate != null ? `${rejectAcc.overturnRate}%` : '—'}
          tone={rejectAcc?.overturnRate >= 25 ? 'text-amber-700' : 'text-slate-900'}
          hint={rejectAcc && rejectAcc.confirmed + rejectAcc.overturned ? `${rejectAcc.overturned} of ${rejectAcc.confirmed + rejectAcc.overturned} reviewed` : 'None reviewed yet'}
        />
      </div>
      {rejectAcc?.overturnRate >= 25 && rejectAcc.confirmed + rejectAcc.overturned >= 4 && (
        <div className="mb-6">
          <Alert kind="warning">People overturn {rejectAcc.overturnRate}% of AI rejections. Consider lowering the reject threshold or switching jobs to Recommend mode.</Alert>
        </div>
      )}

      <Card>
        <div className="px-4 pt-2 sm:px-5">
          <Tabs label="AI decisions" tabs={VIEWS.map((v) => ({ id: v.id, label: v.label, count: counts[v.id] }))} value={view} onChange={(v) => setQuery({ view: v === 'pending' ? undefined : v })} />
        </div>
        <div role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`}>
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:px-5">
            <label className="relative block min-w-0 flex-1 sm:max-w-xs">
              <span className="sr-only">Search by name</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name…" className={cx(inputClass(), 'pl-9')} />
            </label>
            {selectable && items.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-violet-600"
                    checked={allSelected}
                    onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i._id)) : new Set())}
                  />
                  {selected.size ? `${selected.size} selected` : 'Select all'}
                </label>
                {selected.size > 0 && (
                  <>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmBulk('overturned')}>
                      {actions.overturn} ({selected.size})
                    </Button>
                    <Button size="sm" variant={actions.confirmTone} disabled={busy} onClick={() => setConfirmBulk('confirmed')}>
                      {actions.confirm} ({selected.size})
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {loading && !data ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : items.length === 0 ? (
            <EmptyState icon={ShieldCheck} title={debouncedQ ? 'No matches' : 'All clear'} description={debouncedQ ? 'No one with that name in this list.' : current.empty} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <Row
                  key={item._id}
                  item={item}
                  view={view}
                  busy={busy}
                  selectable={selectable}
                  selected={selected.has(item._id)}
                  onSelect={(on) =>
                    setSelected((s) => {
                      const next = new Set(s);
                      on ? next.add(item._id) : next.delete(item._id);
                      return next;
                    })
                  }
                  onReview={manager ? review : null}
                />
              ))}
            </ul>
          )}
        </div>
      </Card>

      <p className="mt-4 text-xs text-slate-500">
        The AI judges only job-related qualifications and is told to ignore name, age, gender, nationality and similar. It can be wrong: anyone rejected by AI can be reinstated, and moving a candidate by hand counts as reviewing the AI’s decision.
      </p>

      <ConfirmDialog
        open={Boolean(confirmBulk)}
        onClose={() => setConfirmBulk(null)}
        loading={busy}
        danger={view === 'pending' && confirmBulk === 'confirmed'}
        title={`${confirmBulk === 'confirmed' ? actions?.confirm : actions?.overturn} for ${selected.size} candidate${selected.size === 1 ? '' : 's'}?`}
        confirmLabel={confirmBulk === 'confirmed' ? actions?.confirm : actions?.overturn}
        message={
          view === 'pending' && confirmBulk === 'confirmed'
            ? 'They will be moved to Rejected with the AI’s reasons recorded. You can still move them back later.'
            : 'Each decision is recorded in the candidate’s timeline with your name.'
        }
        onConfirm={() => review([...selected], confirmBulk)}
      />
    </>
  );
}

export default function AiScreeningPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AiScreening />
    </Suspense>
  );
}
