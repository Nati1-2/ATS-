'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileCheck2, Sparkles, Upload, X } from 'lucide-react';
import { api, useApi } from '@/lib/api';
import { formatBytes, relativeTime, RESUME_FORMATS } from '@/lib/constants';
import CvReport, { tone } from '@/components/CvReport';
import { Alert, Button, Card, ConfirmDialog, cx, EmptyState, inputClass, LoadingState, PageHeader, Spinner, TextArea, TextInput, useToast } from '@/components/ui';

function CheckForm({ applicationId, presetJob, onDone, aiEnabled }) {
  const toast = useToast();
  const router = useRouter();
  const jobs = useApi('/jobs');
  const fileRef = useRef(null);
  const [mode, setMode] = useState('upload');
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [target, setTarget] = useState(presetJob || '');
  const [role, setRole] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const app = useApi(applicationId ? `/applications/${applicationId}/ai` : null); // permission check only
  useEffect(() => setTarget(presetJob || ''), [presetJob]);

  async function submit(e) {
    e.preventDefault();
    setErrors({});
    const fd = new FormData();
    if (applicationId) fd.append('applicationId', applicationId);
    else if (mode === 'upload') {
      if (!file) return setErrors({ resume: 'Choose a CV file' });
      fd.append('resume', file);
    } else {
      if (text.trim().length < 100) return setErrors({ text: 'Paste the whole CV (at least 100 characters)' });
      fd.append('text', text);
    }
    if (target === 'other') fd.append('targetRole', role);
    else if (target) fd.append('jobId', target);
    setBusy(true);
    try {
      const { check } = await api('/cv-checker', { method: 'POST', form: fd });
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setText('');
      onDone(check);
    } catch (err) {
      setErrors(err.fields || {});
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 print:hidden">
      <form onSubmit={submit} noValidate className="space-y-4">
        <h2 className="text-base font-semibold">Check a CV</h2>
        {applicationId ? (
          <div className="flex items-center gap-2 rounded-lg bg-violet-50 p-3 text-sm text-violet-900 ring-1 ring-inset ring-violet-200">
            <FileCheck2 className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">{app.error ? 'You can’t open this applicant.' : 'Checking this applicant’s CV on file.'}</span>
            <button type="button" onClick={() => router.replace('/cv-checker')} className="rounded p-1 hover:bg-violet-100" aria-label="Check a different CV">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div role="radiogroup" aria-label="CV source" className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
              {[
                ['upload', 'Upload file'],
                ['paste', 'Paste text'],
              ].map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)} className={cx('rounded-md px-3 py-1.5 font-medium', mode === v ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900')}>
                  {label}
                </button>
              ))}
            </div>
            {mode === 'upload' ? (
              <div>
                <label
                  htmlFor="cv-file"
                  className={cx(
                    'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm hover:bg-slate-50',
                    errors.resume ? 'border-rose-400' : 'border-slate-300'
                  )}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
                  }}
                >
                  <Upload className="h-5 w-5 text-slate-400" aria-hidden />
                  {file ? (
                    <span className="font-medium text-slate-900">
                      {file.name} <span className="font-normal text-slate-500">· {formatBytes(file.size)}</span>
                    </span>
                  ) : (
                    <span className="font-medium text-blue-700">Choose a file or drop it here</span>
                  )}
                  <span className="text-xs text-slate-500">{RESUME_FORMATS.map((f) => f.ext.slice(1).toUpperCase()).join(', ')}</span>
                </label>
                <input
                  id="cv-file"
                  ref={fileRef}
                  type="file"
                  className="sr-only"
                  accept={RESUME_FORMATS.map((f) => f.ext).join(',')}
                  onChange={(e) => {
                    setFile(e.target.files[0] || null);
                    setErrors({});
                  }}
                />
                {errors.resume && <p className="mt-1 text-xs font-medium text-rose-600">{errors.resume}</p>}
              </div>
            ) : (
              <TextArea id="cv-text" label="CV text" rows={8} value={text} onChange={(e) => setText(e.target.value)} error={errors.text} placeholder="Paste the full CV here…" />
            )}
          </>
        )}
        <div>
          <label htmlFor="cv-target" className="mb-1.5 block text-sm font-medium text-slate-700">
            Compare with
          </label>
          <select id="cv-target" value={target} onChange={(e) => setTarget(e.target.value)} className={inputClass()}>
            <option value="">No specific job (general review)</option>
            {(jobs.data?.jobs || []).map((j) => (
              <option key={j._id} value={j._id}>
                {j.title}
              </option>
            ))}
            <option value="other">Another role…</option>
          </select>
        </div>
        {target === 'other' && <TextInput id="cv-role" label="Role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Data analyst" maxLength={200} />}
        <Button type="submit" loading={busy} className="w-full">
          {!busy && <Sparkles className="h-4 w-4" aria-hidden />} {busy ? 'Reading the CV…' : 'Check CV'}
        </Button>
        {busy && (
          <p role="status" className="flex items-center gap-2 text-xs text-slate-500">
            <Spinner className="h-4 w-4 text-violet-600" /> {aiEnabled ? 'The AI is reviewing the CV. This usually takes 15–40 seconds.' : 'Running the quick checks…'}
          </p>
        )}
        <p className="text-xs text-slate-500">Uploaded files are read and then deleted; only the report is saved, visible to you.</p>
      </form>
    </Card>
  );
}

function History({ checks, activeId }) {
  if (!checks?.length) return null;
  return (
    <Card className="print:hidden">
      <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold">Your recent checks</h2>
      <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
        {checks.map((c) => {
          const score = c.review?.overallScore ?? c.quick?.score;
          return (
            <li key={c._id}>
              <Link href={`/cv-checker?id=${c._id}`} aria-current={c._id === activeId ? 'true' : undefined} className={cx('flex items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50', c._id === activeId && 'bg-violet-50/60')}>
                <span className={cx('w-8 text-right font-semibold tabular-nums', tone(score))}>{score}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900">{c.candidateName || c.fileName || 'Pasted CV'}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {c.jobTitle || c.targetRole || 'General review'} · {relativeTime(c.createdAt)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function CvChecker() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const id = params.get('id');
  const applicationId = params.get('application');
  const presetJob = params.get('job') || '';
  const history = useApi('/cv-checker');
  const current = useApi(id ? `/cv-checker/${id}` : null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const check = id ? current.data?.check : null;

  async function remove() {
    setDeleting(true);
    try {
      await api(`/cv-checker/${id}`, { method: 'DELETE' });
      toast('Check deleted');
      setConfirmDelete(false);
      history.reload();
      router.replace('/cv-checker');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader title="CV checker" description="Get a score, strengths, weaknesses and specific fixes for any CV, compared with one of your jobs or reviewed in general." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <CheckForm
            applicationId={applicationId}
            presetJob={presetJob}
            aiEnabled={history.data?.aiEnabled}
            onDone={(c) => {
              history.reload();
              router.push(`/cv-checker?id=${c._id}`);
            }}
          />
          <History checks={history.data?.checks} activeId={id} />
        </div>
        <div className="min-w-0 lg:col-span-2">
          {!id ? (
            <Card>
              <EmptyState
                icon={FileCheck2}
                title="Your report will appear here"
                description="Upload a CV or paste its text. You’ll get an overall score, a breakdown, strengths and weaknesses, rewrites of weak lines, missing keywords and quick ATS checks."
              />
            </Card>
          ) : current.loading && !check ? (
            <LoadingState label="Loading report…" />
          ) : current.error ? (
            <Alert>{current.error.message}</Alert>
          ) : (
            check && <CvReport check={check} onDelete={() => setConfirmDelete(true)} />
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        loading={deleting}
        danger
        title="Delete this check?"
        message="The report will be removed from your history."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </>
  );
}

export default function CvCheckerPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <CvChecker />
    </Suspense>
  );
}
