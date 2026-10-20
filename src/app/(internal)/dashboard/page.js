'use client';

import Link from 'next/link';
import { ArrowRight, Briefcase, CalendarClock, CheckCircle2, Eye, FileText, Plus, UserCheck, Users, XCircle } from 'lucide-react';
import { useApi, useOnNewApplications } from '@/lib/api';
import { canManage, formatDate, relativeTime, STAGES } from '@/lib/constants';
import { useAuth } from '@/components/AuthProvider';
import { Avatar, ButtonLink, Card, cx, EmptyState, ErrorState, LoadingState, MatchMeter, PageHeader, StageBadge } from '@/components/ui';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function StatCard({ label, value, icon: Icon, href, tone }) {
  return (
    <Link href={href} className="group block rounded-xl focus-visible:outline-offset-4">
      <Card className="flex h-full flex-col items-start gap-3 p-4 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        <div className={cx('rounded-xl p-2.5 sm:p-3', tone)}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
        </div>
      </Card>
    </Link>
  );
}

function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const SCREENING_ROWS = [
  ['review', 'Needs review', 'Waiting for a person to decide', Eye, 'bg-amber-50 text-amber-600'],
  ['advanced', 'Auto-shortlisted', 'Moved to Screening automatically', CheckCircle2, 'bg-emerald-50 text-emerald-600'],
  ['rejected', 'Auto-rejected', 'Did not meet the job’s rules', XCircle, 'bg-rose-50 text-rose-600'],
];

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi('/dashboard');
  useOnNewApplications(reload);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        description={`Here’s your hiring at a glance · ${formatDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}`}
        actions={
          <>
            {canManage(user) && (
              <ButtonLink href="/jobs/new">
                <Plus className="h-4 w-4" aria-hidden /> Create job
              </ButtonLink>
            )}
            <ButtonLink href="/candidates" variant="secondary">
              <Users className="h-4 w-4" aria-hidden /> View candidates
            </ButtonLink>
          </>
        }
      />
      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <Card>
          <ErrorState error={error} onRetry={reload} />
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard label="Open jobs" value={data.stats.openJobs} icon={Briefcase} href="/jobs?status=published" tone="bg-blue-50 text-blue-600" />
            <StatCard label="Total applications" value={data.stats.totalApplications} icon={FileText} href="/candidates" tone="bg-sky-50 text-sky-600" />
            <StatCard label="Upcoming interviews" value={data.stats.upcomingInterviews} icon={CalendarClock} href="#upcoming" tone="bg-indigo-50 text-indigo-600" />
            <StatCard label="Hired" value={data.stats.hired} icon={UserCheck} href="/candidates?stage=hired" tone="bg-emerald-50 text-emerald-600" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Recent applications"
                action={
                  <Link href="/candidates" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
                    View all <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                }
              />
              {data.recentApplications.length === 0 ? (
                <EmptyState title="No applications yet" description="Publish a job and share your careers page to start receiving applications." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.recentApplications.map((a) => (
                    <li key={a._id}>
                      <Link href={`/candidates/${a.candidate._id}?application=${a._id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                        <Avatar name={a.candidate.fullName} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{a.candidate.fullName}</p>
                          <p className="truncate text-xs text-slate-500">
                            {a.job.title} · {relativeTime(a.createdAt)}
                          </p>
                        </div>
                        <span className="hidden sm:block">
                          <MatchMeter score={a.match?.score} />
                        </span>
                        <StageBadge stage={a.stage} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <div className="space-y-6">
              {data.screening && (
                <Card>
                  <CardHeader title="Automatic CV screening" subtitle="What the rules decided when people applied" />
                  <ul className="divide-y divide-slate-100">
                    {SCREENING_ROWS.map(([key, label, hint, Icon, tone]) => (
                      <li key={key}>
                        <Link href={`/candidates?decision=${key}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                          <span className={cx('rounded-lg p-2', tone)}>
                            <Icon className="h-4 w-4" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-slate-900">{label}</span>
                            <span className="block truncate text-xs text-slate-500">{hint}</span>
                          </span>
                          <span className="text-lg font-semibold tabular-nums text-slate-900">{data.screening[key]}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <Card>
                <CardHeader title="Hiring stages" />
                <ul className="space-y-3 p-5">
                  {data.stageSummary.map(({ stage, count }) => {
                    const max = Math.max(1, ...data.stageSummary.map((s) => s.count));
                    const meta = STAGES.find((s) => s.value === stage);
                    return (
                      <li key={stage}>
                        <Link href={`/candidates?stage=${stage}`} className="block rounded hover:bg-slate-50">
                          <div className="mb-1 flex justify-between text-sm">
                            <span className="text-slate-700">{meta.label}</span>
                            <span className="font-medium tabular-nums text-slate-900">{count}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100" aria-hidden>
                            <div className={`h-2 rounded-full ${meta.dot}`} style={{ width: `${(count / max) * 100}%` }} />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          </div>

          <Card id="upcoming">
            <CardHeader title="Upcoming interviews" />
            {data.nextInterviews.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No upcoming interviews" description="Schedule interviews from a candidate's profile." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.nextInterviews.map((i) => {
                  const d = new Date(i.scheduledAt);
                  return (
                    <li key={i._id}>
                      <Link href={`/candidates/${i.candidate._id}?tab=interviews`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50">
                        <span className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-indigo-50 py-1 text-indigo-700">
                          <span className="text-[10px] font-semibold uppercase">{d.toLocaleDateString(undefined, { month: 'short' })}</span>
                          <span className="text-lg font-semibold leading-none">{d.getDate()}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">
                            {i.candidate.fullName} <span className="font-normal text-slate-500">· {i.job.title}</span>
                          </span>
                          <span className="block text-xs text-slate-500">
                            {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} with {i.interviewer.name}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
