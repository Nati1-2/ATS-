'use client';

import { useState } from 'react';
import { CheckCircle2, Clock, Copy, Sparkles } from 'lucide-react';
import { api, useApi } from '@/lib/api';
import { formatDateTime } from '@/lib/constants';
import { useSeeker } from '@/components/SeekerProvider';
import { Alert, Button, ButtonLink, Card, ErrorState, LoadingState, TextArea, TextInput, useToast } from '@/components/ui';

const UNLOCKS = ['What to fix first, in priority order', 'Weaknesses with a clear fix for each', 'Before/after rewrites of your weak lines', 'Missing keywords for the role you want', 'Section-by-section feedback and ATS checks'];

function Waiting({ payment }) {
  return (
    <Card className="p-6 text-center sm:p-8">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-200">
        <Clock className="h-6 w-6" aria-hidden />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">Waiting for approval</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        We received your payment details (transaction <strong>{payment.reference}</strong>, sent {formatDateTime(payment.createdAt)}). An admin checks that the payment arrived, then your full CV reports unlock. You can close this page.
      </p>
      <ButtonLink href="/my" variant="secondary" className="mt-6">
        Back to my dashboard
      </ButtonLink>
    </Card>
  );
}

function PayForm({ info, onPaid }) {
  const toast = useToast();
  const { seeker } = useSeeker();
  const [form, setForm] = useState({ payerName: seeker?.name || '', payerEmail: seeker?.email || '', reference: '', note: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const price = `${info.amount} ${info.currency}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(info.payeeEmail);
      toast('Email copied');
    } catch {
      /* the email is on screen to copy by hand */
    }
  }

  async function submit(e) {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      await api('/seeker/payment', { method: 'POST', body: form });
      onPaid();
    } catch (err) {
      setErrors(err.fields || {});
      toast(err.message, 'error');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {info.payment?.status === 'rejected' && <Alert kind="warning">Your last payment could not be confirmed{info.payment.rejectReason ? `: ${info.payment.rejectReason}` : '.'} Please check the details and send them again.</Alert>}
      <Card className="p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span> Pay {price} with {info.method}
        </h2>
        <p className="mt-2 text-sm text-slate-600">Send the payment from your Payoneer account to this email:</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
          <span className="min-w-0 flex-1 break-all font-mono text-base font-semibold text-slate-900">{info.payeeEmail}</span>
          <Button size="sm" variant="secondary" onClick={copy}>
            <Copy className="h-4 w-4" aria-hidden /> Copy
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Amount: <strong className="text-slate-700">{price}</strong>. Keep the transaction ID from your Payoneer receipt for the next step.
        </p>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">2</span> Tell us about your payment
        </h2>
        <form onSubmit={submit} noValidate className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput id="payerName" label="Name on your Payoneer account" value={form.payerName} onChange={set('payerName')} error={errors.payerName} required />
            <TextInput id="payerEmail" label="Your Payoneer email" type="email" value={form.payerEmail} onChange={set('payerEmail')} error={errors.payerEmail} required />
          </div>
          <TextInput id="reference" label="Transaction ID" value={form.reference} onChange={set('reference')} error={errors.reference} hint="From your Payoneer receipt or activity page" required />
          <TextArea id="note" label="Note (optional)" rows={2} value={form.note} onChange={set('note')} error={errors.note} maxLength={1000} />
          <Button type="submit" loading={busy} className="h-11 w-full">
            I’ve paid {price}
          </Button>
          <p className="text-xs text-slate-500">An admin confirms the payment arrived, usually within a day. Your full reports unlock right after.</p>
        </form>
      </Card>
    </div>
  );
}

export default function UpgradePage() {
  const { data: info, error, loading, reload } = useApi('/seeker/payment');
  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_18rem]">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Improve your CV</h1>
        <p className="mt-1 text-sm text-slate-600">Unlock the full report for every CV you check.</p>
        <div className="mt-6">
          {loading && !info ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : info.premium ? (
            <Alert kind="success">
              Your account is upgraded. <a href="/my" className="font-medium underline">Open your full reports</a>.
            </Alert>
          ) : info.payment?.status === 'pending' ? (
            <Waiting payment={info.payment} />
          ) : (
            <PayForm info={info} onPaid={reload} />
          )}
        </div>
      </div>
      <aside>
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Sparkles className="h-4 w-4 text-violet-600" aria-hidden /> What you get
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {UNLOCKS.map((u) => (
              <li key={u} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                {u}
              </li>
            ))}
          </ul>
          {info && (
            <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
              One payment of <strong className="text-slate-900">{info.amount} {info.currency}</strong>
            </p>
          )}
        </Card>
      </aside>
    </div>
  );
}
