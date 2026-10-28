'use client';

import { use, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock } from 'lucide-react';
import { useApi } from '@/lib/api';
import CvReport, { ScoreRing } from '@/components/CvReport';
import CvChat from '@/components/CvChat';
import { Card, ErrorState, LoadingState, Spinner } from '@/components/ui';
import { UpgradeButton } from '../../PaymentStatus';

export default function SeekerCheckPage({ params }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi(`/seeker/checks/${id}`);
  const payment = useApi('/seeker/payment').data;
  const check = data?.check;
  const scoring = Boolean(check?.pending);
  useEffect(() => {
    if (!scoring) return;
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [scoring, reload]);
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      <Link href="/my" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 print:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden /> My dashboard
      </Link>
      {loading && !check ? (
        <LoadingState label="Loading your report…" />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : check.pending ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center" role="status">
          <Spinner className="h-8 w-8 text-blue-600" />
          <p className="font-medium text-slate-900">Scoring your CV…</p>
          <p className="text-sm text-slate-600">This usually takes under a minute. The page updates by itself.</p>
        </Card>
      ) : check.locked ? (
        <Card className="flex flex-col items-center gap-4 p-8 text-center">
          <ScoreRing score={check.score} label="CV score" />
          <p className="font-medium text-slate-900">{check.fileName || 'Your CV'}</p>
          <p className="flex max-w-md items-center gap-1.5 text-sm text-slate-600">
            <Lock className="h-4 w-4 shrink-0" aria-hidden /> Upgrade to see what to fix, rewrites of your weak lines and missing keywords, and to chat with AI about your CV.
          </p>
          <UpgradeButton info={payment} size="md" />
        </Card>
      ) : (
        <>
          <CvReport check={check} />
          <CvChat key={check._id} check={check} endpoint={`/seeker/checks/${check._id}/chat`} />
        </>
      )}
    </div>
  );
}
