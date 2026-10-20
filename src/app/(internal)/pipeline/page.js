'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowRightLeft, GripVertical, KanbanSquare, FileText } from 'lucide-react';
import { api, useApi, useOnNewApplications } from '@/lib/api';
import { canManage, relativeTime, shortAgo, STAGES } from '@/lib/constants';
import { useAuth } from '@/components/AuthProvider';
import { Avatar, Badge, ButtonLink, MatchBadge, Card, cx, EmptyState, ErrorState, inputClass, JobStatusBadge, LoadingState, PageHeader, useToast } from '@/components/ui';

/** Keyboard/screen-reader alternative to drag and drop. */
function MoveMenu({ application, onMove }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector('[role="menuitem"]')?.focus();
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function onKeyDown(e) {
    const items = [...ref.current.querySelectorAll('[role="menuitem"]')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') items[(i + 1) % items.length].focus();
    else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length].focus();
    else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
      if (e.key === 'Escape') buttonRef.current?.focus();
    } else return;
    e.preventDefault();
  }

  return (
    <div className="relative" ref={ref} onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Move ${application.candidate.fullName} to another stage`}
        onClick={() => setOpen((o) => !o)}
        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <ArrowRightLeft className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label="Move to stage" className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {STAGES.filter((s) => s.value !== application.stage).map((s) => (
            <button
              key={s.value}
              role="menuitem"
              type="button"
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                onMove(application, s.value);
                buttonRef.current?.focus();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 focus:bg-blue-50 focus:outline-none"
            >
              <span className={cx('h-2 w-2 rounded-full', s.dot)} aria-hidden />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Board({ jobId, editable }) {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi(`/applications?job=${jobId}`);
  useOnNewApplications(reload);
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  const [announcement, setAnnouncement] = useState('');

  async function move(application, stage) {
    if (application.stage === stage) return;
    const prev = application.stage;
    const label = STAGES.find((s) => s.value === stage).label;
    // Optimistic update; revert on failure
    setData((d) => ({ ...d, applications: d.applications.map((a) => (a._id === application._id ? { ...a, stage, stageChangedAt: new Date().toISOString() } : a)) }));
    try {
      await api(`/applications/${application._id}/stage`, { method: 'PATCH', body: { stage } });
      setAnnouncement(`${application.candidate.fullName} moved to ${label}`);
      toast(`${application.candidate.fullName} → ${label}`);
    } catch (err) {
      setData((d) => ({ ...d, applications: d.applications.map((a) => (a._id === application._id ? { ...a, stage: prev } : a)) }));
      toast(err.message, 'error');
    }
  }

  if (loading && !data) return <LoadingState label="Loading pipeline…" />;
  if (error)
    return (
      <Card>
        <ErrorState error={error} onRetry={reload} />
      </Card>
    );

  const byStage = Object.fromEntries(STAGES.map((s) => [s.value, []]));
  for (const a of data.applications) byStage[a.stage]?.push(a);

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {data.applications.length === 0 && (
        <Card className="mb-4">
          <EmptyState icon={KanbanSquare} title="No applications for this job yet" description="New applications from the careers page will appear in the Applied column." />
        </Card>
      )}
      <div className="relative -mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <div className="grid min-w-[1020px] grid-cols-6 gap-3">
          {STAGES.map((stage) => (
            <section
              key={stage.value}
              aria-label={`${stage.label} column`}
              onDragOver={(e) => {
                if (!editable || !dragging) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setOver(stage.value);
              }}
              onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (dragging) move(dragging, stage.value);
                setDragging(null);
              }}
              className={cx('flex min-h-[420px] flex-col rounded-xl border bg-slate-100/70 transition-colors', over === stage.value ? 'border-blue-400 bg-blue-50' : 'border-transparent')}
            >
              <header className="flex items-center justify-between px-3 py-2.5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <span className={cx('h-2 w-2 rounded-full', stage.dot)} aria-hidden />
                  {stage.label}
                </h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{byStage[stage.value].length}</span>
              </header>
              <ul className="flex-1 space-y-2 px-2 pb-2">
                {byStage[stage.value].map((a) => (
                  <li
                    key={a._id}
                    draggable={editable}
                    onDragStart={(e) => {
                      setDragging(a);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', a._id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    className={cx(
                      'rounded-lg border border-slate-200 bg-white p-3 shadow-xs',
                      editable && 'cursor-grab active:cursor-grabbing',
                      dragging?._id === a._id && 'opacity-50'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Avatar name={a.candidate.fullName} className="h-7 w-7 text-[10px]" />
                      <div className="min-w-0 flex-1">
                        <Link href={`/candidates/${a.candidate._id}?application=${a._id}`} className="block text-sm font-medium leading-snug text-slate-900 hover:text-blue-700 hover:underline">
                          {a.candidate.fullName}
                        </Link>
                      </div>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500" title={a.candidate.email}>
                      {a.candidate.email}
                    </p>
                    {(a.match?.score != null || a.screeningPassed === false) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <MatchBadge score={a.match?.score} />
                        {a.screeningPassed === false && <Badge className="bg-rose-50 text-rose-800 ring-rose-300">Knockout</Badge>}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-1.5 border-t border-slate-100 pt-2 text-xs text-slate-500">
                      {editable && <GripVertical className="h-3.5 w-3.5 text-slate-300" aria-hidden />}
                      <span className="flex-1 truncate" title={`Applied ${relativeTime(a.createdAt)}`}>
                        <span className="sr-only">Applied {relativeTime(a.createdAt)}</span>
                        <span aria-hidden>Applied {shortAgo(a.createdAt)}</span>
                      </span>
                      {a.resume && <FileText className="h-3.5 w-3.5" aria-label="Has résumé" />}
                      {editable && <MoveMenu application={a} onMove={move} />}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

function Pipeline() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const jobs = useApi('/jobs');
  const list = jobs.data?.jobs ?? [];
  const jobId = params.get('job') || list.find((j) => j.status === 'published')?._id || list[0]?._id;
  const job = list.find((j) => j._id === jobId);

  return (
    <>
      <PageHeader
        title="Hiring pipeline"
        description={canManage(user) ? 'Drag cards between stages, or use the move button on each card.' : 'View candidates by stage. Only recruiters can move candidates.'}
        actions={
          list.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="pipeline-job" className="text-sm font-medium text-slate-700">
                Job
              </label>
              <select id="pipeline-job" value={jobId || ''} onChange={(e) => router.replace(`${pathname}?job=${e.target.value}`)} className={cx(inputClass(), 'w-64')}>
                {list.map((j) => (
                  <option key={j._id} value={j._id}>
                    {j.title} ({j.status})
                  </option>
                ))}
              </select>
            </div>
          )
        }
      />
      {jobs.loading && !jobs.data ? (
        <LoadingState />
      ) : jobs.error ? (
        <Card>
          <ErrorState error={jobs.error} onRetry={jobs.reload} />
        </Card>
      ) : !job ? (
        <Card>
          <EmptyState
            icon={KanbanSquare}
            title="No jobs yet"
            description="Create a job to start building your pipeline."
            action={canManage(user) && <ButtonLink href="/jobs/new">Create job</ButtonLink>}
          />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
            <Link href={`/jobs/${job._id}`} className="font-medium text-slate-900 hover:underline">
              {job.title}
            </Link>
            <JobStatusBadge status={job.status} />
            <span>· {job.applicationCount} applications</span>
          </div>
          <Board key={job._id} jobId={job._id} editable={canManage(user)} />
        </>
      )}
    </>
  );
}

export default function PipelinePage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Pipeline />
    </Suspense>
  );
}
