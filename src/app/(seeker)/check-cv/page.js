'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileCheck2, Lock, Sparkles, Upload, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { formatBytes, RESUME_FORMATS } from '@/lib/constants';
import { useSeeker } from '@/components/SeekerProvider';
import { rememberUpload } from '../my/justUploaded';
import { Button, Card, cx, TextInput, useToast } from '@/components/ui';

const STEPS = [
  [Upload, 'Upload your CV', 'PDF, Word, ODT, RTF or text.'],
  [UserPlus, 'Sign up or sign in', 'Your result is saved to your account.'],
  [FileCheck2, 'See your score', 'On your dashboard, next to your job applications.'],
  [Sparkles, 'Upgrade to improve it', 'Unlock fixes, rewrites and missing keywords.'],
];

export default function CheckCvPage() {
  const router = useRouter();
  const toast = useToast();
  const { seeker } = useSeeker();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [role, setRole] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!file) return setErrors({ resume: 'Choose your CV file' });
    const fd = new FormData();
    fd.append('resume', file);
    if (role.trim()) fd.append('targetRole', role.trim());
    setBusy(true);
    setErrors({});
    try {
      const { id, signedIn } = await api('/seeker/check', { method: 'POST', form: fd });
      rememberUpload(id);
      router.push(signedIn ? '/my' : '/my/signup?checked=1');
    } catch (err) {
      setErrors(err.fields || {});
      toast(err.message, 'error');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_22rem] lg:py-16">
      <div>
        <p className="text-sm font-semibold text-blue-700">Free CV score</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">How strong is your CV?</h1>
        <p className="mt-3 max-w-xl text-slate-600">Upload your CV and get a score out of 100, based on the same things recruiters and applicant tracking systems look for.</p>

        <Card className="mt-8 p-5 sm:p-6">
          <form onSubmit={submit} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="cv-file"
                className={cx(
                  'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-10 text-center text-sm hover:bg-slate-50',
                  errors.resume ? 'border-rose-400' : 'border-slate-300'
                )}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
                }}
              >
                <Upload className="h-6 w-6 text-slate-400" aria-hidden />
                {file ? (
                  <span className="font-medium text-slate-900">
                    {file.name} <span className="font-normal text-slate-500">· {formatBytes(file.size)}</span>
                  </span>
                ) : (
                  <span className="font-medium text-blue-700">Choose your CV or drop it here</span>
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
            <TextInput id="cv-role" label="Role you are aiming for (optional)" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Data analyst" maxLength={200} error={errors.targetRole} />
            <Button type="submit" loading={busy} className="h-11 w-full">
              {!busy && <Sparkles className="h-4 w-4" aria-hidden />} {busy ? 'Uploading your CV…' : 'Check my CV'}
            </Button>
            <p className="flex gap-1.5 text-xs text-slate-500">
              <Lock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              Your file is read and then deleted; only the result is saved, and only you can see it.
              {!seeker && ' You’ll create a free account to see it.'}
            </p>
          </form>
        </Card>
      </div>

      <aside aria-label="How it works" className="lg:pt-24">
        <h2 className="text-sm font-semibold text-slate-900">How it works</h2>
        <ol className="mt-4 space-y-5">
          {STEPS.map(([Icon, title, text], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {i + 1}. {title}
                </p>
                <p className="text-sm text-slate-600">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
