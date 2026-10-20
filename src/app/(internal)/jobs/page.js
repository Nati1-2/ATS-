'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Briefcase, Eye, KanbanSquare, Pencil, Plus, Search, Send, XCircle } from 'lucide-react';
import { api, qs, useApi, useLeaveGuard } from '@/lib/api';
import { canManage, employmentLabel, formatDate, JOB_STATUSES, remoteLabel } from '@/lib/constants';
import { useAuth } from '@/components/AuthProvider';
import { Button, ButtonLink, Card, ConfirmDialog, cx, EmptyState, ErrorState, inputClass, JobStatusBadge, LoadingState, PageHeader, useToast } from '@/components/ui';

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function JobsList() {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const status = params.get('status') || '';
  const [q, setQ] = useState(params.get('q') || '');
  const debouncedQ = useDebounced(q);
  const { data, error, loading, reload } = useApi(`/jobs${qs({ q: debouncedQ, status })}`);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const manager = canManage(user);

  const { leaving, onClickCapture } = useLeaveGuard();
  useEffect(() => {
    if (leaving.current) return; // user already clicked through to a job
    router.replace(`${pathname}${qs({ q: debouncedQ, status })}`, { scroll: false });
  }, [debouncedQ, status, pathname, router, leaving]);

  async function changeStatus(job, action) {
    setBusy(true);
    try {
      await api(`/jobs/${job._id}/${action}`, { method: 'POST' });
      toast(action === 'publish' ? `"${job.title}" is now live` : `"${job.title}" was closed`);
      setConfirm(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const setStatus = (s) => router.replace(`${pathname}${qs({ q: debouncedQ, status: s })}`, { scroll: false });

  return (
    <div onClickCapture={onClickCapture}>
      <PageHeader
        title="Jobs"
        description="Create, publish, and manage open roles."
        actions={
          manager && (
            <ButtonLink href="/jobs/new">
                <Plus className="h-4 w-4" aria-hidden /> Create job
              </ButtonLink>
          )
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
          <div role="tablist" aria-label="Filter by status" className="relative flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
            {[{ value: '', label: 'All' }, ...JOB_STATUSES].map((s) => (
              <button
                key={s.value}
                role="tab"
                aria-selected={status === s.value}
                onClick={() => setStatus(s.value)}
                className={cx(
                  'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium',
                  status === s.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="relative md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <label htmlFor="job-search" className="sr-only">
              Search jobs
            </label>
            <input id="job-search" type="search" placeholder="Search title, department, location" value={q} onChange={(e) => setQ(e.target.value)} className={cx(inputClass(), 'pl-9')} />
          </div>
        </div>

        {loading && !data ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : data.jobs.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title={q || status ? 'No jobs match your filters' : 'No jobs yet'}
            description={q || status ? 'Try a different search or status.' : 'Create your first job to start hiring.'}
            action={manager && !q && !status && <Link href="/jobs/new" className="text-sm font-medium text-blue-600 hover:underline">Create a job</Link>}
          />
        ) : (
          <div className={cx('relative overflow-x-auto', loading && 'opacity-60')}>
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Job</th>
                  <th scope="col" className="px-4 py-3 font-medium">Location</th>
                  <th scope="col" className="px-4 py-3 font-medium">Type</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Applications</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.jobs.map((job) => (
                  <tr key={job._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/jobs/${job._id}`} className="font-medium text-slate-900 hover:text-blue-700 hover:underline">
                        {job.title}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {job.department} · Updated {formatDate(job.updatedAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {job.location}
                      <p className="text-xs text-slate-500">{remoteLabel(job.remotePolicy)}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{employmentLabel(job.employmentType)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">{job.applicationCount}</td>
                    <td className="px-4 py-3">
                      <JobStatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Link href={`/jobs/${job._id}`} title="View" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                          <Eye className="h-4 w-4" aria-hidden />
                          <span className="sr-only">View {job.title}</span>
                        </Link>
                        <Link href={`/pipeline?job=${job._id}`} title="Pipeline" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                          <KanbanSquare className="h-4 w-4" aria-hidden />
                          <span className="sr-only">Pipeline for {job.title}</span>
                        </Link>
                        {manager && (
                          <>
                            <Link href={`/jobs/${job._id}/edit`} title="Edit" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                              <Pencil className="h-4 w-4" aria-hidden />
                              <span className="sr-only">Edit {job.title}</span>
                            </Link>
                            {job.status !== 'published' ? (
                              <Button size="sm" variant="secondary" onClick={() => setConfirm({ job, action: 'publish' })}>
                                <Send className="h-3.5 w-3.5" aria-hidden /> Publish
                              </Button>
                            ) : (
                              <Button size="sm" variant="secondary" onClick={() => setConfirm({ job, action: 'close' })}>
                                <XCircle className="h-3.5 w-3.5" aria-hidden /> Close
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        loading={busy}
        danger={confirm?.action === 'close'}
        title={confirm?.action === 'publish' ? 'Publish job?' : 'Close job?'}
        confirmLabel={confirm?.action === 'publish' ? 'Publish' : 'Close job'}
        message={
          confirm?.action === 'publish'
            ? `"${confirm?.job.title}" will appear on the public careers page and accept applications.`
            : `"${confirm?.job.title}" will stop accepting applications. Existing applications are kept.`
        }
        onConfirm={() => changeStatus(confirm.job, confirm.action)}
      />
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <JobsList />
    </Suspense>
  );
}
