'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, CalendarPlus, CheckCircle2, Clock, Download, Eye, EyeOff, FileCheck2, FileText, Mail, MessageSquare, Phone, Star, XCircle,
} from 'lucide-react';
import { api, useApi } from '@/lib/api';
import {
  canManage, resumeFormatLabel, formatBytes, formatDate, formatDateTime, recommendationLabel, RECOMMENDATIONS, relativeTime, roleLabel, STAGES,
} from '@/lib/constants';
import { useAuth } from '@/components/AuthProvider';
import AiPanel from '@/components/AiPanel';
import {
  Alert, Avatar, Badge, Button, Card, cx, DecisionBadge, MatchMeter, matchTone, TabPanel, Tabs, EmptyState, ErrorState, LoadingState, Modal, SelectInput, StageBadge, TextArea, TextInput, useToast,
} from '@/components/ui';

function SectionCard({ title, action, children }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

const EVIDENCE_TONE = {
  experience: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  listed: 'bg-blue-50 text-blue-800 ring-blue-200',
  education: 'bg-blue-50 text-blue-800 ring-blue-200',
  cover_letter: 'bg-amber-50 text-amber-800 ring-amber-200',
  aspirational: 'bg-amber-50 text-amber-800 ring-amber-200',
};

/** Explains a CV match score: weighted components, per-skill evidence, experience, education and warnings. */
function MatchReport({ match: m }) {
  const legacy = !m.components; // scored before the detailed report existed
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className={cx('flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-xl ring-1 ring-inset', matchTone(m.score))}>
          <span className="text-3xl font-semibold">{m.score}%</span>
          <span className="text-[10px] font-medium uppercase tracking-wide">CV match</span>
        </div>
        {legacy ? (
          <p className="text-sm text-slate-600">Matched: {m.matched?.join(', ') || 'none'}. Missing: {m.missingMustHave?.join(', ') || 'none'}.</p>
        ) : (
          <ul className="min-w-0 flex-1 space-y-2.5" aria-label="Score breakdown">
            {m.components.map((c) => (
              <li key={c.key}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-800">
                    {c.label} <span className="text-xs font-normal text-slate-400">· weight {c.weight}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{c.score}%</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-100" aria-hidden>
                  <div className={cx('h-1.5 rounded-full', c.score >= 75 ? 'bg-emerald-500' : c.score >= 50 ? 'bg-amber-500' : 'bg-rose-500')} style={{ width: `${c.score}%` }} />
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500" title={c.detail}>
                  {c.detail}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {m.flags?.length > 0 && (
        <Alert kind="info">
          <p className="font-medium">Check this CV manually</p>
          <ul className="mt-1 list-disc pl-5">
            {m.flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Alert>
      )}

      {!legacy && m.skills?.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-slate-500">Skills evidence</p>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 text-sm">
            {m.skills.map((s) => (
              <li key={`${s.required}-${s.skill}`} className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-4">
                <span className="shrink-0 sm:w-44">
                  <span className="font-medium">{s.skill}</span>{' '}
                  <span className={cx('ml-1 text-[10px] font-semibold uppercase', s.required ? 'text-rose-700' : 'text-slate-400')}>
                    {s.required ? 'must' : 'nice'}
                    <span className="sr-only">{s.required ? '-have' : ' to have'}</span>
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  {s.found ? (
                    <>
                      <Badge className={EVIDENCE_TONE[s.evidence]}>{s.evidenceLabel}</Badge>
                      {s.snippet && <span className="mt-1 block break-words text-xs italic text-slate-500">“{s.snippet}”</span>}
                    </>
                  ) : (
                    <Badge className="bg-rose-50 text-rose-800 ring-rose-200">Not found</Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!legacy && (
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Experience</dt>
            <dd className="font-medium">
              {m.yearsExperience != null ? `${m.yearsExperience} years` : 'Unknown'}
              {m.yearsSource && <span className="block text-xs font-normal text-slate-500">{m.yearsSource === 'dates' ? 'from job dates' : 'as stated on CV'}</span>}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Highest education</dt>
            <dd className="font-medium">{m.education?.label ?? 'Not found'}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Closest job title</dt>
            <dd className="truncate font-medium" title={m.titleMatch?.line ?? ''}>
              {m.titleMatch?.line ? m.titleMatch.line.split('|')[0].trim() : 'Not found'}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function ScreeningPanel({ application: a }) {
  const m = a.match;
  const hasMatch = m && m.score != null;
  const answers = a.screeningAnswers || [];
  if (!hasMatch && !answers.length && a.resumeTextExtracted !== false && !a.autoDecisionReasons?.length) return null;
  return (
    <SectionCard
      title="CV screening"
      action={
        a.autoDecision ? (
          <DecisionBadge decision={a.autoDecision} />
        ) : a.screeningPassed === false ? (
          <Badge className="bg-rose-50 text-rose-800 ring-rose-300">Failed screening</Badge>
        ) : answers.some((x) => x.knockout) ? (
          <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-300">Passed screening</Badge>
        ) : null
      }
    >
      <div className="space-y-4 p-5">
        {a.autoDecision && a.autoDecision !== 'review' && (
          <Alert kind={a.autoDecision === 'rejected' ? 'error' : 'success'}>
            <p className="font-medium">
              {['rejected', 'advanced'].includes(a.aiScreen?.action)
                ? a.autoDecision === 'rejected' ? 'Rejected by AI screening' : 'Shortlisted to Screening by AI screening'
                : a.autoDecision === 'rejected' ? 'Automatically rejected when they applied' : 'Automatically shortlisted to Screening when they applied'}
            </p>
            <ul className="mt-1 list-disc pl-5">
              {(a.autoDecisionReasons || []).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs opacity-80">You can override this at any time by changing the stage.</p>
          </Alert>
        )}
        {a.autoDecision === 'review' && a.autoDecisionReasons?.length > 0 && (
          <Alert kind="info">
            <p className="font-medium">Needs manual review</p>
            <ul className="mt-1 list-disc pl-5">
              {a.autoDecisionReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Alert>
        )}
        {a.resumeTextExtracted === false && (
          <Alert kind="info">No text could be read from this résumé. It may be a scanned image. The match score only uses the cover letter, so review the résumé manually.</Alert>
        )}
        {hasMatch && <MatchReport match={m} />}
        {answers.length > 0 && (
          <div className={hasMatch ? 'border-t border-slate-200 pt-4' : ''}>
            <p className="mb-2 text-xs font-medium text-slate-500">Screening answers</p>
            <dl className="space-y-2">
              {answers.map((x) => (
                <div key={x.questionId} className="flex items-start justify-between gap-4 text-sm">
                  <dt className="text-slate-600">{x.question}</dt>
                  <dd className={cx('shrink-0 text-right font-medium', x.passed ? 'text-slate-900' : 'text-rose-700')}>
                    {x.type === 'yes_no' ? (x.answer === 'yes' ? 'Yes' : 'No') : x.answer}
                    {!x.passed && <span className="ml-1 text-xs">(knockout)</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function StageControl({ application, onChanged }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  async function change(stage) {
    setSaving(true);
    try {
      await api(`/applications/${application._id}/stage`, { method: 'PATCH', body: { stage } });
      toast(`Moved to ${STAGES.find((s) => s.value === stage).label}`);
      onChanged();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="stage-select" className="text-sm text-slate-600">
        Stage
      </label>
      <select
        id="stage-select"
        value={application.stage}
        disabled={saving}
        onChange={(e) => change(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      >
        {STAGES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ResumePanel({ application }) {
  const [preview, setPreview] = useState(false);
  const r = application.resume;
  if (!r) return <p className="px-5 py-4 text-sm text-slate-500">No résumé on file.</p>;
  const url = `/api/applications/${application._id}/resume`;
  const isPdf = r.mimetype === 'application/pdf' || r.originalName.toLowerCase().endsWith('.pdf');
  return (
    <div className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <FileText className="h-8 w-8 text-blue-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{r.originalName}</p>
          <p className="text-xs text-slate-500">
            {resumeFormatLabel(r.originalName)} · {formatBytes(r.size)}
          </p>
        </div>
        {isPdf && (
          <Button size="sm" variant="secondary" onClick={() => setPreview((p) => !p)} aria-expanded={preview}>
            {preview ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            {preview ? 'Hide preview' : 'Preview'}
          </Button>
        )}
        <a href={url} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
          <Download className="h-4 w-4" aria-hidden /> Download
        </a>
        <Link
          href={`/cv-checker?application=${application._id}&job=${application.job?._id ?? ''}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-50 px-3 text-sm font-medium text-violet-800 ring-1 ring-inset ring-violet-200 hover:bg-violet-100"
        >
          <FileCheck2 className="h-4 w-4" aria-hidden /> Check CV quality
        </Link>
      </div>
      {preview && <iframe title={`Résumé preview: ${r.originalName}`} src={`${url}?inline=1`} className="mt-4 h-[70vh] w-full rounded-lg border border-slate-200" />}
      {!isPdf && <p className="mt-3 text-xs text-slate-500">Only PDFs can be previewed in the browser — download this file to view it.</p>}
    </div>
  );
}

function ScheduleInterview({ application, open, onClose, onSaved }) {
  const toast = useToast();
  const team = useApi(open ? '/settings/team' : null);
  const [form, setForm] = useState({ date: '', time: '10:00', durationMinutes: '60', interviewer: '', location: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    const scheduledAt = form.date && form.time ? new Date(`${form.date}T${form.time}`) : null;
    if (!form.date) errs.date = 'Select a date';
    if (!form.time) errs.time = 'Select a time';
    if (scheduledAt && scheduledAt < new Date()) errs.date = 'Choose a time in the future';
    if (!form.interviewer) errs.interviewer = 'Select an interviewer';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await api(`/applications/${application._id}/interviews`, {
        method: 'POST',
        body: { scheduledAt: scheduledAt.toISOString(), durationMinutes: form.durationMinutes, interviewer: form.interviewer, location: form.location },
      });
      toast('Interview scheduled');
      setForm({ date: '', time: '10:00', durationMinutes: '60', interviewer: '', location: '' });
      onSaved();
      onClose();
    } catch (err) {
      setErrors(err.fields || { _: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Schedule interview — ${application.job.title}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="interview-form" loading={saving}>
            Schedule
          </Button>
        </>
      }
    >
      <form id="interview-form" onSubmit={submit} noValidate className="space-y-4">
        {errors._ && <Alert>{errors._}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Date" type="date" required value={form.date} onChange={set('date')} error={errors.date || errors.scheduledAt} min={new Date().toISOString().slice(0, 10)} />
          <TextInput label="Time" type="time" required value={form.time} onChange={set('time')} error={errors.time} />
        </div>
        <SelectInput
          label="Duration"
          value={form.durationMinutes}
          onChange={set('durationMinutes')}
          options={[30, 45, 60, 90, 120].map((m) => ({ value: String(m), label: `${m} minutes` }))}
        />
        <SelectInput
          label="Interviewer"
          required
          placeholder={team.loading ? 'Loading…' : 'Select interviewer'}
          value={form.interviewer}
          onChange={set('interviewer')}
          error={errors.interviewer}
          options={(team.data?.users || []).map((u) => ({ value: u.id, label: `${u.name} (${roleLabel(u.role)})` }))}
        />
        <TextInput label="Location or link" value={form.location} onChange={set('location')} placeholder="Video call link or room" hint="Optional" />
      </form>
    </Modal>
  );
}

function Interviews({ application, interviews, manager, onChanged }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  async function setStatus(i, status) {
    try {
      await api(`/interviews/${i._id}`, { method: 'PATCH', body: { status } });
      toast(`Interview marked ${status}`);
      onChanged();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  const statusBadge = {
    scheduled: 'bg-blue-50 text-blue-800 ring-blue-300',
    completed: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
    cancelled: 'bg-slate-100 text-slate-600 ring-slate-300',
  };
  return (
    <SectionCard
      title="Interviews"
      action={
        manager && (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            <CalendarPlus className="h-4 w-4" aria-hidden /> Schedule
          </Button>
        )
      }
    >
      {interviews.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">No interviews scheduled for this application.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {interviews.map((i) => (
            <li key={i._id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {formatDateTime(i.scheduledAt)} <span className="font-normal text-slate-500">· {i.durationMinutes} min</span>
                </p>
                <p className="text-xs text-slate-500">
                  with {i.interviewer?.name}
                  {i.location && ` · ${i.location}`}
                </p>
              </div>
              <Badge className={statusBadge[i.status]}>{i.status[0].toUpperCase() + i.status.slice(1)}</Badge>
              {manager && i.status === 'scheduled' && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setStatus(i, 'completed')}>
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Done
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setStatus(i, 'cancelled')}>
                    <XCircle className="h-4 w-4" aria-hidden /> Cancel
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <ScheduleInterview application={application} open={open} onClose={() => setOpen(false)} onSaved={onChanged} />
    </SectionCard>
  );
}

function NotesAndFeedback({ application, notes, user, onChanged }) {
  const toast = useToast();
  const manager = canManage(user);
  const [kind, setKind] = useState(manager ? 'note' : 'feedback');
  const [form, setForm] = useState({ body: '', rating: '', recommendation: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (!form.body.trim()) errs.body = 'Write something first';
    if (kind === 'feedback' && !form.rating) errs.rating = 'Select a rating';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await api(`/applications/${application._id}/notes`, {
        method: 'POST',
        body: { kind, body: form.body, ...(kind === 'feedback' ? { rating: form.rating, recommendation: form.recommendation || undefined } : {}) },
      });
      toast(kind === 'feedback' ? 'Feedback added' : 'Note added');
      setForm({ body: '', rating: '', recommendation: '' });
      onChanged();
    } catch (err) {
      setErrors(err.fields || { body: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Notes & feedback">
      <form onSubmit={submit} noValidate className="space-y-3 border-b border-slate-200 p-5">
        {manager && (
          <div role="radiogroup" aria-label="Type" className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {[
              ['note', 'Internal note'],
              ['feedback', 'Feedback'],
            ].map(([v, l]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={kind === v}
                onClick={() => setKind(v)}
                className={cx('flex-1 rounded-md px-3 py-1.5 font-medium', kind === v ? 'bg-white shadow-sm' : 'text-slate-600')}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        <TextArea
          label={kind === 'feedback' ? 'Your feedback' : 'Note'}
          rows={3}
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          error={errors.body}
          placeholder={kind === 'feedback' ? 'Strengths, concerns, and overall impression…' : 'Visible to the hiring team only'}
        />
        {kind === 'feedback' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectInput
              label="Rating"
              required
              placeholder="Select rating"
              value={form.rating}
              onChange={(e) => setForm({ ...form, rating: e.target.value })}
              error={errors.rating}
              options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} / 5` }))}
            />
            <SelectInput
              label="Recommendation"
              placeholder="No recommendation"
              value={form.recommendation}
              onChange={(e) => setForm({ ...form, recommendation: e.target.value })}
              options={RECOMMENDATIONS}
            />
          </div>
        )}
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={saving}>
            {kind === 'feedback' ? 'Add feedback' : 'Add note'}
          </Button>
        </div>
      </form>
      {notes.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">No notes or feedback yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {notes.map((n) => (
            <li key={n._id} className="flex gap-3 px-5 py-4">
              <Avatar name={n.author?.name} className="h-8 w-8 text-xs" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{n.author?.name}</span>
                  <Badge className={n.kind === 'feedback' ? 'bg-violet-50 text-violet-800 ring-violet-300' : 'bg-slate-100 text-slate-700 ring-slate-300'}>
                    {n.kind === 'feedback' ? 'Feedback' : 'Note'}
                  </Badge>
                  <span className="text-xs text-slate-500" title={formatDateTime(n.createdAt)}>
                    {relativeTime(n.createdAt)}
                  </span>
                </div>
                {n.kind === 'feedback' && (
                  <p className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                    <span className="flex" aria-label={`Rating ${n.rating} out of 5`}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={cx('h-3.5 w-3.5', s <= n.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} aria-hidden />
                      ))}
                    </span>
                    {n.recommendation && <span>· {recommendationLabel(n.recommendation)}</span>}
                  </p>
                )}
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{n.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function Timeline({ activity }) {
  return (
    <SectionCard title="Activity timeline">
      {activity.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">No activity yet.</p>
      ) : (
        <ol className="relative space-y-4 p-5">
          {activity.map((a, idx) => (
            <li key={a._id} className="relative flex gap-3">
              {idx < activity.length - 1 && <span className="absolute left-[11px] top-6 h-full w-px bg-slate-200" aria-hidden />}
              <span className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 ring-4 ring-white">
                {a.type === 'stage_changed' || a.type.startsWith('auto_') ? <Clock className="h-3.5 w-3.5" /> : a.type.startsWith('interview') ? <CalendarPlus className="h-3.5 w-3.5" /> : a.type === 'applied' ? <FileText className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
              </span>
              <div>
                <p className="text-sm text-slate-800">
                  {a.actor ? <span className="font-medium">{a.actor.name}</span> : <span className="font-medium">{a.type === 'applied' ? 'Candidate' : 'System'}</span>} {a.message.charAt(0).toLowerCase() + a.message.slice(1)}
                </p>
                <p className="text-xs text-slate-500">{formatDateTime(a.createdAt)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

function Profile() {
  const { id } = useParams();
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { data, error, loading, reload } = useApi(`/candidates/${id}`);
  const selectedId = params.get('application') || data?.applications[0]?._id;
  const app = data?.applications.find((a) => a._id === selectedId) ?? data?.applications[0];
  const manager = canManage(user);
  const [tab, setTab] = useState(params.get('tab') || 'overview');

  const scoped = useMemo(() => {
    if (!data || !app) return { notes: [], interviews: [], activity: [] };
    const mine = (x) => x.application === app._id;
    return { notes: data.notes.filter(mine), interviews: data.interviews.filter(mine), activity: data.activity.filter(mine) };
  }, [data, app]);

  useEffect(() => {
    if (data?.candidate) document.title = `${data.candidate.fullName} · ATS`;
  }, [data]);

  if (loading && !data) return <LoadingState />;
  if (error)
    return (
      <Card>
        <ErrorState error={error} onRetry={reload} />
      </Card>
    );

  const { candidate, applications } = data;

  return (
    <>
      <Link href="/candidates" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All candidates
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-4">
              <Avatar name={candidate.fullName} className="h-14 w-14 text-lg" />
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold">{candidate.fullName}</h1>
                <p className="text-sm text-slate-500">Candidate since {formatDate(candidate.createdAt)}</p>
              </div>
            </div>
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <dt>
                  <Mail className="h-4 w-4 text-slate-400" aria-label="Email" />
                </dt>
                <dd className="min-w-0 truncate">
                  <a href={`mailto:${candidate.email}`} className="text-blue-700 hover:underline">
                    {candidate.email}
                  </a>
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <dt>
                  <Phone className="h-4 w-4 text-slate-400" aria-label="Phone" />
                </dt>
                <dd>{candidate.phone ? <a href={`tel:${candidate.phone}`} className="hover:underline">{candidate.phone}</a> : <span className="text-slate-400">Not provided</span>}</dd>
              </div>
            </dl>
          </Card>

          <SectionCard title={`Applications (${applications.length})`}>
            <ul className="divide-y divide-slate-100">
              {applications.map((a) => (
                <li key={a._id}>
                  <button
                    type="button"
                    onClick={() => router.replace(`/candidates/${id}?application=${a._id}`, { scroll: false })}
                    aria-current={a._id === app?._id ? 'true' : undefined}
                    className={cx('flex w-full items-start justify-between gap-3 px-5 py-3 text-left hover:bg-slate-50', a._id === app?._id && 'bg-blue-50/60')}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">{a.job.title}</span>
                      <span className="block text-xs text-slate-500">Applied {formatDate(a.createdAt)}</span>
                    </span>
                    <StageBadge stage={a.stage} />
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        {app ? (
          <div className="lg:col-span-2">
            <Card className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Application</p>
                  <Link href={`/jobs/${app.job._id}`} className="text-lg font-semibold hover:text-blue-700 hover:underline">
                    {app.job.title}
                  </Link>
                  <p className="text-sm text-slate-500">
                    {app.job.department} · {app.job.location} · Applied {formatDate(app.createdAt)} ·{' '}
                    <Link href={`/pipeline?job=${app.job._id}`} className="text-blue-700 hover:underline">
                      View pipeline
                    </Link>
                  </p>
                </div>
                {manager ? <StageControl application={app} onChanged={reload} /> : <StageBadge stage={app.stage} />}
              </div>
              {(app.match?.score != null || app.autoDecision || app.ai?.status === 'done') && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-sm">
                  {app.match?.score != null && (
                    <span className="inline-flex items-center gap-2 text-slate-600">
                      CV match <MatchMeter score={app.match.score} srLabel={false} />
                    </span>
                  )}
                  <DecisionBadge decision={app.autoDecision} />
                  {app.ai?.status === 'done' && <Badge className="bg-violet-50 text-violet-800 ring-violet-200">AI: {app.ai.fitLevel} fit</Badge>}
                  {app.screeningPassed === false && <Badge className="bg-rose-50 text-rose-800 ring-rose-300">Failed a knockout question</Badge>}
                </div>
              )}
            </Card>

            <div className="mt-4">
              <Tabs
                label="Application details"
                value={tab}
                onChange={setTab}
                tabs={[
                  { id: 'overview', label: 'Overview' },
                  { id: 'resume', label: 'Résumé' },
                  { id: 'interviews', label: 'Interviews', count: scoped.interviews.length },
                  { id: 'notes', label: 'Notes & feedback', count: scoped.notes.length },
                  { id: 'activity', label: 'Activity', count: scoped.activity.length },
                ]}
              />
              <TabPanel id="overview" active={tab === 'overview'}>
                <AiPanel application={app} canRun={manager} onUpdated={reload} />
                <ScreeningPanel application={app} />
              </TabPanel>
              <TabPanel id="resume" active={tab === 'resume'}>
                <SectionCard title="Résumé">
                  <ResumePanel key={app._id} application={app} />
                </SectionCard>
                <SectionCard title="Cover letter">
                  {app.coverLetter ? (
                    <p className="whitespace-pre-line p-5 text-sm leading-relaxed text-slate-700">{app.coverLetter}</p>
                  ) : (
                    <p className="p-5 text-sm text-slate-500">No cover letter was included.</p>
                  )}
                </SectionCard>
              </TabPanel>
              <TabPanel id="interviews" active={tab === 'interviews'}>
                <Interviews application={app} interviews={scoped.interviews} manager={manager} onChanged={reload} />
              </TabPanel>
              <TabPanel id="notes" active={tab === 'notes'}>
                <NotesAndFeedback key={app._id} application={app} notes={scoped.notes} user={user} onChanged={reload} />
              </TabPanel>
              <TabPanel id="activity" active={tab === 'activity'}>
                <Timeline activity={scoped.activity} />
              </TabPanel>
            </div>
          </div>
        ) : (
          <Card className="lg:col-span-2">
            <EmptyState title="No applications" description="This candidate has no applications you can access." />
          </Card>
        )}
      </div>
    </>
  );
}

export default function CandidateProfilePage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Profile />
    </Suspense>
  );
}
