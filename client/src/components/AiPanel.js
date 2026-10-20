'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { api, AI_SCREENING_CHANGED_EVENT } from '@/lib/api';
import { AI_ACTIONS, AI_SCREEN_MODE_MAP, formatDateTime, relativeTime } from '@/lib/constants';
import { Alert, Badge, Button, Card, cx, Spinner, useToast } from './ui';

const FIT = {
  strong: { label: 'Strong fit', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
  good: { label: 'Good fit', tone: 'bg-blue-50 text-blue-800 ring-blue-300' },
  partial: { label: 'Partial fit', tone: 'bg-amber-50 text-amber-800 ring-amber-300' },
  weak: { label: 'Weak fit', tone: 'bg-rose-50 text-rose-800 ring-rose-300' },
};
const LEVEL_TONE = {
  strong: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  some: 'bg-amber-50 text-amber-800 ring-amber-200',
  none: 'bg-slate-100 text-slate-500 ring-slate-200',
};

const REVIEW_LABELS = {
  pending_reject: { title: 'AI recommends rejecting', confirm: 'Reject', overturn: 'Keep in Applied' },
  rejected: { title: 'Rejected by AI screening', confirm: 'Confirm rejection', overturn: 'Reinstate to Applied' },
  advanced: { title: 'Shortlisted by AI screening', confirm: 'Confirm shortlist', overturn: 'Move back to Applied' },
  review: { title: 'AI screening held this for a person' },
};

/** The decision the job's AI screening rules made, with confirm / overturn for recruiters. */
function AiDecision({ application, canRun, onUpdated }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const d = application.aiScreen;
  if (!d || (d.action === 'review' && !d.reasons?.length)) return null;
  const labels = REVIEW_LABELS[d.action];
  const open = !d.review && labels.confirm && (d.action === 'pending_reject' ? application.stage === 'applied' : d.action === 'rejected' ? application.stage === 'rejected' : application.stage === 'screening');

  async function review(outcome) {
    setBusy(outcome);
    try {
      const r = await api('/ai-screening/review', { method: 'POST', body: { ids: [application._id], outcome } });
      toast(r.updated ? (outcome === 'confirmed' ? 'AI decision confirmed' : 'AI decision overturned') : 'This decision was already handled');
      window.dispatchEvent(new Event(AI_SCREENING_CHANGED_EVENT));
      onUpdated?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cx('rounded-lg p-3 ring-1 ring-inset', d.action === 'advanced' ? 'bg-emerald-50 ring-emerald-200' : d.action === 'review' ? 'bg-amber-50 ring-amber-200' : 'bg-violet-50 ring-violet-200')}>
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-violet-600" aria-hidden />
        <p className="text-sm font-semibold text-slate-900">{labels.title}</p>
        <Badge className={AI_ACTIONS[d.action]?.badge}>{AI_SCREEN_MODE_MAP[d.mode]?.short} mode</Badge>
        {d.review && (
          <span className="text-xs text-slate-600">
            {d.review.outcome === 'confirmed' ? 'Confirmed' : 'Overturned'} by {d.review.byName} {relativeTime(d.review.at)}
          </span>
        )}
      </div>
      <ul className="mt-1.5 space-y-0.5 text-sm text-slate-700">
        {d.reasons.map((r) => (
          <li key={r}>• {r}</li>
        ))}
      </ul>
      {open && canRun && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" loading={busy === 'overturned'} disabled={Boolean(busy)} onClick={() => review('overturned')}>
            {labels.overturn}
          </Button>
          <Button size="sm" variant={d.action === 'pending_reject' ? 'danger' : 'secondary'} loading={busy === 'confirmed'} disabled={Boolean(busy)} onClick={() => review('confirmed')}>
            {labels.confirm}
          </Button>
        </div>
      )}
    </div>
  );
}

/** AI summary of an application, plus any decision the job's AI screening rules made from it. */
export default function AiPanel({ application, canRun, onUpdated }) {
  const toast = useToast();
  const [ai, setAi] = useState(application.ai ?? null);
  const [starting, setStarting] = useState(false);
  const busy = ai?.status === 'pending' || ai?.status === 'processing';

  useEffect(() => setAi(application.ai ?? null), [application._id, application.ai]);

  // While the analysis runs, check its status every few seconds
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(async () => {
      try {
        const { ai: next } = await api(`/applications/${application._id}/ai`);
        if (next?.status !== 'pending' && next?.status !== 'processing') {
          setAi(next);
          onUpdated?.(); // reload the profile: scores or stage may change for scanned CVs
        }
      } catch {
        /* keep polling */
      }
    }, 4000);
    return () => clearInterval(t);
  }, [busy, application._id, onUpdated]);

  async function run() {
    setStarting(true);
    try {
      const res = await api(`/applications/${application._id}/ai`, { method: 'POST' });
      setAi(res.ai);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setStarting(false);
    }
  }

  if (ai?.status === 'disabled' && !canRun) return null;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="h-4 w-4 text-violet-600" aria-hidden /> AI summary
        </h2>
        {ai?.status === 'done' && (
          <div className="flex items-center gap-2">
            <Badge className={FIT[ai.fitLevel]?.tone}>
              {FIT[ai.fitLevel]?.label} · {ai.fitScore}%
            </Badge>
            {canRun && (
              <Button size="icon" variant="ghost" onClick={run} loading={starting} aria-label="Re-run AI analysis" title="Re-run AI analysis">
                {!starting && <RefreshCw className="h-4 w-4" />}
              </Button>
            )}
          </div>
        )}
      </div>

      {!ai || ai.status === 'disabled' ? (
        <div className="flex flex-col items-start gap-3 p-5 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>{ai?.status === 'disabled' ? 'AI analysis was off when this person applied.' : 'This application has not been analysed by AI yet.'}</p>
          {canRun && (
            <Button size="sm" onClick={run} loading={starting}>
              <Sparkles className="h-4 w-4" aria-hidden /> Run AI analysis
            </Button>
          )}
        </div>
      ) : busy ? (
        <div role="status" className="flex items-center gap-3 p-5 text-sm text-slate-600">
          <Spinner className="text-violet-600" />
          {ai.waitingForRateLimit
            ? `The AI service is busy (rate limit). It will try again automatically around ${new Date(ai.retryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
            : 'AI is reading this CV… this usually takes 10–30 seconds.'}
        </div>
      ) : ai.status === 'failed' ? (
        <div className="space-y-3 p-5">
          <Alert>AI analysis failed: {ai.error}</Alert>
          {canRun && (
            <Button size="sm" variant="secondary" onClick={run} loading={starting}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Try again
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4 p-5">
          {ai.injectionAttempt && (
            <Alert>
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4" aria-hidden /> Possible manipulation attempt
              </p>
              <p className="mt-0.5">This CV contains text aimed at the AI or screening system. It was ignored, but review this application carefully.</p>
            </Alert>
          )}
          {ai.readable === false && <Alert>The AI could not read this file as a CV.</Alert>}
          {application.resumeTextSource === 'ai' && (
            <Alert kind="info">This was a scanned CV. The AI read the text from the image, and the CV match score uses that text. Small reading mistakes are possible.</Alert>
          )}
          <AiDecision application={application} canRun={canRun} onUpdated={onUpdated} />
          {ai.summary && <p className="text-sm leading-relaxed text-slate-800">{ai.summary}</p>}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              ['Strengths', ai.strengths, 'text-emerald-700', '+'],
              ['To check in interview', ai.concerns, 'text-amber-700', '?'],
            ].map(([title, list, tone, mark]) => (
              <div key={title}>
                <p className={cx('mb-1.5 text-xs font-semibold uppercase tracking-wide', tone)}>{title}</p>
                {list?.length ? (
                  <ul className="space-y-1.5 text-sm text-slate-700">
                    {list.map((x) => (
                      <li key={x} className="flex gap-2">
                        <span className={cx('font-semibold', tone)} aria-hidden>
                          {mark}
                        </span>
                        <span>{x}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400">None noted</p>
                )}
              </div>
            ))}
          </div>

          {ai.skills?.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500">Skills, judged by meaning</p>
              <div className="flex flex-wrap gap-1.5">
                {ai.skills.map((s) => (
                  <Badge key={s.skill} className={LEVEL_TONE[s.level]}>
                    <span title={s.evidence || undefined}>
                      {s.skill} · {s.level === 'none' ? 'not shown' : s.level}
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">
            AI-generated by {ai.model} on {formatDateTime(ai.analyzedAt)}. It can be wrong.{' '}
            {application.aiScreen && application.aiScreen.action !== 'review'
              ? 'This job uses AI screening, so the fit score was used to make the decision above. You can overturn it.'
              : 'Use it as a starting point and make the decision yourself. It does not change the stage or the rule-based CV match.'}
          </p>
        </div>
      )}
    </Card>
  );
}
