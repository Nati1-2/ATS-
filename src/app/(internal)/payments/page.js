'use client';

import { useState } from 'react';
import { Check, CreditCard, X } from 'lucide-react';
import { api, useApi, PAYMENTS_CHANGED_EVENT } from '@/lib/api';
import { formatDateTime } from '@/lib/constants';
import { useAuth } from '@/components/AuthProvider';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, LoadingState, Modal, PageHeader, Tabs, TextArea, useToast } from '@/components/ui';

const STATUS_STYLE = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  rejected: 'bg-slate-100 text-slate-600 ring-slate-300',
};

function PaymentRow({ p, onApprove, onReject }) {
  return (
    <li className="flex flex-wrap items-start gap-4 px-5 py-4">
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900">{p.seeker?.name ?? 'Deleted account'}</span>
          <span className="text-slate-500">{p.seeker?.email}</span>
          <Badge className={STATUS_STYLE[p.status]}>{p.status}</Badge>
        </p>
        <p className="text-slate-700">
          <strong>
            {p.amount} {p.currency}
          </strong>{' '}
          via Payoneer from {p.payerName} ({p.payerEmail})
        </p>
        <p className="text-slate-700">
          Transaction ID: <span className="font-mono font-medium text-slate-900">{p.reference}</span>
        </p>
        {p.note && <p className="text-slate-600">“{p.note}”</p>}
        <p className="text-xs text-slate-500">
          Sent {formatDateTime(p.createdAt)}
          {p.reviewedAt && ` · ${p.status} by ${p.reviewedBy?.name ?? 'an admin'} ${formatDateTime(p.reviewedAt)}`}
          {p.rejectReason && ` · reason: ${p.rejectReason}`}
        </p>
      </div>
      {p.status === 'pending' && (
        <div className="flex gap-2">
          <Button size="sm" variant="dangerOutline" onClick={() => onReject(p)}>
            <X className="h-4 w-4" aria-hidden /> Reject
          </Button>
          <Button size="sm" onClick={() => onApprove(p)}>
            <Check className="h-4 w-4" aria-hidden /> Approve
          </Button>
        </div>
      )}
    </li>
  );
}

export default function PaymentsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('pending');
  const { data, error, loading, reload } = useApi(user?.role === 'admin' ? `/payments?status=${tab}` : null);
  const [acting, setActing] = useState(null); // { payment, action }
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await api(`/payments/${acting.payment._id}/${acting.action}`, { method: 'POST', body: acting.action === 'reject' ? { reason } : {} });
      toast(acting.action === 'approve' ? 'Payment approved: full reports unlocked' : 'Payment rejected');
      window.dispatchEvent(new Event(PAYMENTS_CHANGED_EVENT));
      setActing(null);
      setReason('');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (user?.role !== 'admin') return <Alert>Only admins can review payments.</Alert>;

  return (
    <>
      <PageHeader title="Payments" description="Job seekers pay by Payoneer to unlock their full CV reports. Check the payment arrived in Payoneer, then approve it." />
      <Tabs
        label="Payment status"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'pending', label: 'Waiting', count: data?.pending },
          { id: 'approved', label: 'Approved' },
          { id: 'rejected', label: 'Rejected' },
        ]}
      />
      <Card className="mt-6">
        {loading && !data ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data.payments.length ? (
          <EmptyState icon={CreditCard} title={tab === 'pending' ? 'Nothing waiting' : `No ${tab} payments`} description={tab === 'pending' ? 'New payment requests from job seekers appear here.' : undefined} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.payments.map((p) => (
              <PaymentRow key={p._id} p={p} onApprove={(payment) => setActing({ payment, action: 'approve' })} onReject={(payment) => setActing({ payment, action: 'reject' })} />
            ))}
          </ul>
        )}
      </Card>
      <Modal
        open={Boolean(acting)}
        onClose={() => setActing(null)}
        title={acting?.action === 'approve' ? 'Approve this payment?' : 'Reject this payment?'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setActing(null)}>
              Cancel
            </Button>
            <Button variant={acting?.action === 'approve' ? 'primary' : 'danger'} loading={busy} onClick={confirm}>
              {acting?.action === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </>
        }
      >
        {acting && (
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              {acting.payment.amount} {acting.payment.currency} from {acting.payment.payerName}, transaction <span className="font-mono">{acting.payment.reference}</span>.
            </p>
            {acting.action === 'approve' ? (
              <p>Only approve once you see this payment in Payoneer. {acting.payment.seeker?.name ?? 'The job seeker'} will get full CV reports straight away.</p>
            ) : (
              <TextArea id="reject-reason" label="Reason shown to the job seeker (optional)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. No payment with this transaction ID arrived" />
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
