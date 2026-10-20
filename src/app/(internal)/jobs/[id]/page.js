'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, KanbanSquare, Pencil, Send, XCircle, BarChart3, ShieldCheck } from 'lucide-react';
import { api, useApi } from '@/lib/api';
import { canManage, employmentLabel, formatDate, formatSalary, remoteLabel, STAGES, educationLabel, AI_SCREEN_MODE_MAP } from '@/lib/constants';
import { useAuth } from '@/components/AuthProvider';
import Markdownish from '@/components/Markdownish';
import { Badge, Button, ButtonLink, Card, ConfirmDialog, ErrorState, JobStatusBadge, LoadingState, useToast } from '@/components/ui';

function AutoRules({ job }) {
  const r = job.autoScreen || {};
  const reject = [
    job.autoRejectKnockouts && 'fails a knockout question',
    r.rejectMissingMustHave && 'is missing a must-have skill',
    r.rejectBelowMinYears && job.minYearsExperience != null && `shows under ${job.minYearsExperience} years of experience`,
    r.rejectMissingEducation && job.minEducation && `is below ${educationLabel(job.minEducation)}`,
    r.rejectBelowScore != null && `matches below ${r.rejectBelowScore}%`,
  ].filter(Boolean);
  const requirements = [
    job.minYearsExperience != null && `${job.minYearsExperience}+ years of experience`,
    job.minEducation && educationLabel(job.minEducation),
  ].filter(Boolean);
  const reqLine = requirements.length > 0 && (
    <p className="mb-2 text-sm">
      <span className="text-xs font-medium text-slate-500">Requirements: </span>
      {requirements.join(' · ')}
    </p>
  );
  if (!reject.length && r.advanceAtScore == null) {
    return (
      <div>
        {reqLine}
        <p className="text-xs text-slate-500">No automatic decisions. Every applicant waits in Applied for review.</p>
      </div>
    );
  }
  return (
    <div>
      {reqLine}
      <p className="mb-1 text-xs font-medium text-slate-500">Automatic decisions</p>
      <ul className="space-y-1 text-sm">
        {reject.length > 0 && (
          <li>
            <span className="font-medium text-rose-700">Reject</span> if the CV {reject.join(' or ')}
          </li>
        )}
        {r.advanceAtScore != null && (
          <li>
            <span className="font-medium text-emerald-700">Shortlist</span> if match ≥ {r.advanceAtScore}% and knockouts pass
          </li>
        )}
        <li className="text-slate-600">Everyone else: needs review</li>
      </ul>
    </div>
  );
}

function AiScreeningCard({ job, applied, manager, onRun }) {
  const r = job.aiScreen || {};
  const on = r.mode && r.mode !== 'off';
  const reject = [r.rejectBelowFit != null && `AI fit is below ${r.rejectBelowFit}%`, r.rejectMissingMustHave && 'the AI finds no evidence of a must-have skill'].filter(Boolean);
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ShieldCheck className="h-4 w-4 text-violet-600" aria-hidden /> AI screening
        </h2>
        <Badge className={AI_SCREEN_MODE_MAP[r.mode || 'off'].badge}>{AI_SCREEN_MODE_MAP[r.mode || 'off'].short}</Badge>
      </div>
      {on ? (
        <>
          <ul className="space-y-1 text-sm">
            {reject.length > 0 && (
              <li>
                <span className="font-medium text-rose-700">{r.mode === 'auto' ? 'Reject' : 'Recommend rejecting'}</span> if {reject.join(' or ')}
              </li>
            )}
            {r.advanceAtFit != null && (
              <li>
                <span className="font-medium text-emerald-700">Shortlist</span> if AI fit ≥ {r.advanceAtFit}% and knockouts pass
              </li>
            )}
          </ul>
          <p className="text-xs text-slate-500">Runs when each AI analysis finishes. Unreadable CVs, manipulation attempts and scanned files always go to a person.</p>
          {manager && (
            <Button size="sm" variant="secondary" onClick={onRun} disabled={!applied}>
              Run AI screening on {applied ?? 0} in Applied
            </Button>
          )}
          <Link href={`/ai-screening?job=${job._id}`} className="block text-sm font-medium text-blue-600 hover:underline">
            Review AI decisions →
          </Link>
        </>
      ) : (
        <p className="text-xs text-slate-500">The AI writes a summary for each applicant but makes no decisions.{manager && ' Turn on AI screening in Edit job to let it reject or shortlist.'}</p>
      )}
    </Card>
  );
}

export default function JobDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(`/jobs/${id}`);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <LoadingState />;
  if (error)
    return (
      <Card>
        <ErrorState error={error} onRetry={reload} />
      </Card>
    );

  const { job, stageCounts } = data;
  const manager = canManage(user);
  const salary = formatSalary(job);

  async function changeStatus(action) {
    setBusy(true);
    if (action === 'run-ai-screening') {
      try {
        const r = await api(`/jobs/${job._id}/run-ai-screening`, { method: 'POST' });
        const parts = [`${r.rejected} rejected`, `${r.pending_reject} to confirm`, `${r.advanced} shortlisted`];
        toast(`AI screened ${r.processed - r.queued}: ${parts.join(', ')}${r.queued ? ` · ${r.queued} queued for AI analysis` : ''}`);
        setConfirm(null);
        reload();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (action === 'run-screening') {
      try {
        const r = await api(`/jobs/${job._id}/run-screening`, { method: 'POST' });
        toast(`Screened ${r.processed}: ${r.advanced} shortlisted, ${r.rejected} rejected, ${r.review} need review`);
        setConfirm(null);
        reload();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      await api(`/jobs/${job._id}/${action}`, { method: 'POST' });
      toast(action === 'publish' ? 'Job published' : 'Job closed');
      setConfirm(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link href="/jobs" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All jobs
      </Link>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
            <JobStatusBadge status={job.status} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {job.department} · {job.location} · {remoteLabel(job.remotePolicy)} · {employmentLabel(job.employmentType)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {job.status !== 'draft' && (
            <a
              href={`/careers/${job._id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 hover:text-slate-900"
              title="View public job page"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              <span className="sr-only">Public page (opens in new tab)</span>
            </a>
          )}
          <ButtonLink href={`/reports?job=${job._id}`} variant="secondary">
            <BarChart3 className="h-4 w-4" aria-hidden /> AI report
          </ButtonLink>
          {manager && (
            <ButtonLink href={`/jobs/${job._id}/edit`} variant="secondary">
              <Pencil className="h-4 w-4" aria-hidden /> Edit
            </ButtonLink>
          )}
          {manager &&
            (job.status === 'published' ? (
              <Button variant="dangerOutline" onClick={() => setConfirm('close')}>
                <XCircle className="h-4 w-4" aria-hidden /> Close job
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setConfirm('publish')}>
                <Send className="h-4 w-4" aria-hidden /> Publish
              </Button>
            ))}
          <ButtonLink href={`/pipeline?job=${job._id}`}>
            <KanbanSquare className="h-4 w-4" aria-hidden /> View pipeline
          </ButtonLink>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5 sm:p-6">
            <h2 className="mb-3 text-base font-semibold">About the role</h2>
            <Markdownish text={job.description} />
            {job.responsibilities && (
              <>
                <h2 className="mb-3 mt-6 text-base font-semibold">Responsibilities</h2>
                <Markdownish text={job.responsibilities} />
              </>
            )}
            {job.requirements && (
              <>
                <h2 className="mb-3 mt-6 text-base font-semibold">Requirements</h2>
                <Markdownish text={job.requirements} />
              </>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 text-base font-semibold">Applications ({job.applicationCount})</h2>
            <ul className="space-y-2">
              {STAGES.map((s) => (
                <li key={s.value}>
                  <Link href={`/candidates?job=${job._id}&stage=${s.value}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
                      {s.label}
                    </span>
                    <span className="font-medium">{stageCounts[s.value] ?? 0}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          {(job.mustHaveSkills?.length > 0 || job.niceToHaveSkills?.length > 0 || job.screeningQuestions?.length > 0 || job.autoRejectKnockouts || job.minYearsExperience != null || job.minEducation) && (
            <Card className="space-y-3 p-5">
              <h2 className="text-base font-semibold">CV screening</h2>
              {[
                ['Must-have skills', job.mustHaveSkills, 'bg-blue-50 text-blue-800 ring-blue-200'],
                ['Nice-to-have skills', job.niceToHaveSkills, 'bg-slate-100 text-slate-700 ring-slate-200'],
              ]
                .filter(([, l]) => l?.length)
                .map(([label, list, tone]) => (
                  <div key={label}>
                    <p className="mb-1 text-xs font-medium text-slate-500">{label}</p>
                    <div className="flex flex-wrap gap-1">
                      {list.map((sk) => (
                        <Badge key={sk} className={tone}>
                          {sk.split('|')[0].trim()}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              {job.screeningQuestions?.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">Screening questions</p>
                  <ul className="space-y-1 text-sm text-slate-700">
                    {job.screeningQuestions.map((q) => (
                      <li key={q._id}>
                        {q.question}
                        {q.knockout && (
                          <span className="ml-1 text-xs font-medium text-rose-700">
                            (knockout: {q.type === 'yes_no' ? `must answer ${q.expectedAnswer}` : `min ${q.minValue}`})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-slate-500">{job.autoRejectKnockouts ? 'Applicants who fail a knockout are rejected automatically.' : 'Applicants who fail a knockout are flagged, not rejected.'}</p>
                </div>
              )}
              <AutoRules job={job} />
              {manager && (job.autoScreen?.rejectBelowScore != null || job.autoScreen?.advanceAtScore != null || job.autoScreen?.rejectMissingMustHave || job.autoScreen?.rejectBelowMinYears || job.autoScreen?.rejectMissingEducation || job.autoRejectKnockouts) && (
                <Button size="sm" variant="secondary" onClick={() => setConfirm('run-screening')} disabled={!stageCounts.applied}>
                  Run rules on {stageCounts.applied ?? 0} applicant{stageCounts.applied === 1 ? '' : 's'} in Applied
                </Button>
              )}
              <Link href={`/candidates?job=${job._id}&sort=score`} className="block text-sm font-medium text-blue-600 hover:underline">
                Rank applicants by match →
              </Link>
            </Card>
          )}
          {job.status !== 'draft' && <AiScreeningCard job={job} applied={stageCounts.applied} manager={manager} onRun={() => setConfirm('run-ai-screening')} />}
          <Card className="p-5">
            <h2 className="mb-3 text-base font-semibold">Details</h2>
            <dl className="space-y-2 text-sm">
              {[
                ['Salary', salary || 'Not specified'],
                ['Hiring managers', job.hiringManagers.map((h) => h.name).join(', ') || 'None assigned'],
                ['Created', formatDate(job.createdAt)],
                ['Published', formatDate(job.publishedAt)],
                ...(job.closedAt ? [['Closed', formatDate(job.closedAt)]] : []),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-medium text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        loading={busy}
        danger={confirm === 'close'}
        title={confirm === 'publish' ? 'Publish job?' : confirm === 'run-screening' ? 'Run screening rules?' : confirm === 'run-ai-screening' ? 'Run AI screening?' : 'Close job?'}
        confirmLabel={confirm === 'publish' ? 'Publish' : confirm === 'run-screening' ? 'Run rules' : confirm === 'run-ai-screening' ? 'Run AI screening' : 'Close job'}
        message={
          confirm === 'publish'
            ? 'This job will appear on the public careers page and start accepting applications.'
            : confirm === 'run-ai-screening'
              ? `The AI screening rules will be applied to applicants still in Applied. ${job.aiScreen?.mode === 'auto' ? 'Some may be rejected or shortlisted straight away.' : 'Rejections will wait for you to confirm; strong fits are shortlisted.'} Anyone without an AI analysis is queued for one. Candidates you have moved are not affected.`
            : confirm === 'run-screening'
              ? `The automatic rules will be applied to the ${stageCounts.applied ?? 0} applicants still in Applied. Some may be rejected or moved to Screening. Candidates you have already moved are not affected.`
              : 'This job will stop accepting applications. Existing applications are kept.'
        }
        onConfirm={() => changeStatus(confirm)}
      />
    </>
  );
}
