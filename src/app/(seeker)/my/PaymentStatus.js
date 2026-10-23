'use client';

import { Clock, Sparkles } from 'lucide-react';
import { Alert, ButtonLink } from '@/components/ui';

/** Where the seeker is with the upgrade: not paid, waiting for an admin, rejected or approved. */
export function PaymentBanner({ info }) {
  const p = info?.payment;
  if (!info || info.premium) return null;
  if (p?.status === 'pending') {
    return <Alert kind="info">Thanks! Your payment (transaction {p.reference}) is waiting for approval. Your full reports unlock as soon as an admin confirms it.</Alert>;
  }
  if (p?.status === 'rejected') {
    return (
      <Alert kind="warning">
        We could not confirm your payment{p.rejectReason ? `: ${p.rejectReason}` : '.'} Check the details and <a href="/my/upgrade" className="font-medium underline">send them again</a>.
      </Alert>
    );
  }
  return null;
}

/** Button under a locked score: upgrade, or a waiting badge while the payment is checked. */
export function UpgradeButton({ info, size = 'sm' }) {
  if (info?.payment?.status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
        <Clock className="h-3.5 w-3.5" aria-hidden /> Waiting for approval
      </span>
    );
  }
  return (
    <ButtonLink href="/my/upgrade" size={size} className="bg-violet-600 hover:bg-violet-700">
      <Sparkles className="h-4 w-4" aria-hidden /> Improve my CV
    </ButtonLink>
  );
}
