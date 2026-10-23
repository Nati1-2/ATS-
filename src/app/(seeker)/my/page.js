'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Briefcase, FileCheck2, Lock, Plus } from 'lucide-react';
import { useApi } from '@/lib/api';
import { formatDate } from '@/lib/constants';
import { useSeeker } from '@/components/SeekerProvider';
import { tone, verdict } from '@/components/CvReport';
import { Badge, ButtonLink, Card, cx, EmptyState, ErrorState, LoadingState, Spinner } from '@/components/ui';
import { PaymentBanner, UpgradeButton } from './PaymentStatus';
import { useJustUploaded } from './justUploaded';

const STATUS_STYLE = {
  'Under review': 'bg-blue-50 text-blue-800 ring-blue-200',
  Interview: 'bg-violet-50 text-violet-800 ring-violet-200',
  Offer: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  Hired: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  'Not selected': 'bg-slate-100 text-slate-600 ring-slate-300',
};

function CvResults({ payment }) {
  const { data, error, loading, reload } = useApi('/seeker/checks');
  const waiting = useJustUploaded(data?.checks);
  const scoring = Boolean(waiting) || data?.checks.some((c) => c.pending);
  // The AI review finishes in the background: refresh until every score is in
  useEffect(() => {
    if (!scoring) return;
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [scoring, reload]);
  if (loading && !data) return <LoadingState label="Loading your results…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const placeholder = waiting && (
    <li className="flex items-center gap-4 px-5 py-4" role="status">
      <div className="flex w-14 justify-center">
        <Spinner className="h-7 w-7 text-blue-600" />
      </div>
      <p className="text-sm text-slate-600">Reading your CV…</p>
    </li>
  );
  if (!data.checks.length && !placeholder) {
    return (
      <EmptyState
        icon={FileCheck2}
        title="No CV checked yet"
        description="Upload your CV to get a score out of 100."
        action={
          <ButtonLink href="/check-cv" size="sm">
            Check my CV
          </ButtonLink>
        }
      />
    );
  }
  return (
    <ul className="divide-y divide-slate-100">
      {placeholder}
      {data.checks.map((c) => (
        <li key={c._id} className="flex flex-wrap items-center gap-4 px-5 py-4">
          <div className="flex w-14 flex-col items-center text-center">
            {c.pending ? (
              <Spinner className="h-7 w-7 text-blue-600" />
            ) : (
              <>
                <span className={cx('block text-2xl font-bold tabular-nums', tone(c.score))}>{c.score}</span>
                <span className="block text-[11px] text-slate-500">/ 100</span>
              </>
            )}
          </div>
          <div className="min-w-[10rem] flex-1">
            <p className="truncate font-medium text-slate-900">{c.fileName || 'Your CV'}</p>
            <p className="text-sm text-slate-600" role={c.pending ? 'status' : undefined}>
              {c.pending ? 'Scoring your CV… usually under a minute' : verdict(c.score)} · {c.targetRole ? `for ${c.targetRole} · ` : ''}
              {formatDate(c.createdAt)}
            </p>
          </div>
          {c.locked ? (
            <div className="flex items-center gap-3">
              <span className="hidden items-center gap-1 text-xs text-slate-500 sm:flex">
                <Lock className="h-3.5 w-3.5" aria-hidden /> Score only
              </span>
              <UpgradeButton info={payment} />
            </div>
          ) : c.pending ? null : (
            <ButtonLink href={`/my/checks/${c._id}`} size="sm" variant="secondary">
              View full report
            </ButtonLink>
          )}
        </li>
      ))}
    </ul>
  );
}

function Applications() {
  const { data, error, loading, reload } = useApi('/seeker/applications');
  if (loading && !data) return <LoadingState label="Loading your applications…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data.applications.length) {
    return (
      <EmptyState
        icon={Briefcase}
        title="No applications yet"
        description="Jobs you apply for while signed in show up here, with their status."
        action={
          <ButtonLink href="/careers#roles" size="sm" variant="secondary">
            Browse open roles
          </ButtonLink>
        }
      />
    );
  }
  return (
    <ul className="divide-y divide-slate-100">
      {data.applications.map((a) => (
        <li key={a._id} className="flex flex-wrap items-center gap-3 px-5 py-4">
          <div className="min-w-0 flex-1">
            {a.job ? (
              <Link href={`/careers/${a.job._id}`} className="font-medium text-slate-900 hover:underline">
                {a.job.title}
              </Link>
            ) : (
              <span className="font-medium text-slate-900">Job no longer listed</span>
            )}
            <p className="text-sm text-slate-600">
              {a.job ? `${a.job.department} · ${a.job.location} · ` : ''}applied {formatDate(a.appliedAt)}
            </p>
          </div>
          <Badge className={STATUS_STYLE[a.status]}>{a.status}</Badge>
        </li>
      ))}
    </ul>
  );
}

export default function SeekerDashboard() {
  const { seeker } = useSeeker();
  const payment = useApi('/seeker/payment').data;
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{seeker ? `Hi, ${seeker.name.split(' ')[0]}` : 'Your dashboard'}</h1>
          <p className="mt-1 text-sm text-slate-600">Your CV results and job applications.</p>
        </div>
        <ButtonLink href="/check-cv" size="sm">
          <Plus className="h-4 w-4" aria-hidden /> Check another CV
        </ButtonLink>
      </div>
      <PaymentBanner info={payment} />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-base font-semibold">CV results</h2>
          {payment && !payment.premium && <p className="text-xs text-slate-500">Upgrade to see what to fix, rewrites of weak lines and missing keywords.</p>}
          {payment?.premium && <Badge className="bg-violet-50 text-violet-800 ring-violet-200">Full reports unlocked</Badge>}
        </div>
        <CvResults payment={payment} />
      </Card>
      <Card>
        <h2 className="border-b border-slate-200 px-5 py-3.5 text-base font-semibold">Job applications</h2>
        <Applications />
      </Card>
    </div>
  );
}
