'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Briefcase, CheckCircle2, FileUp, X } from 'lucide-react';
import { api, useApi } from '@/lib/api';
import { employmentLabel, formatBytes, formatDate, formatSalary, remoteLabel, RESUME_FORMATS } from '@/lib/constants';
import Markdownish from '@/components/Markdownish';
import { Alert, Button, ErrorState, LoadingState, TextArea, TextInput } from '@/components/ui';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ApplyForm({ job, maxResumeMb }) {
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', coverLetter: '' });
  const [resume, setResume] = useState(null);
  const [answers, setAnswers] = useState({});
  const questions = job.screeningQuestions || [];
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef(null);
  const successRef = useRef(null);

  useEffect(() => {
    if (done) successRef.current?.focus();
  }, [done]);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((x) => (x[k] ? { ...x, [k]: undefined } : x));
  };

  function checkFile(file) {
    if (!file) return 'A résumé is required';
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    // Trust the extension here: some systems report these files with a generic type. The server checks the file contents.
    if (!RESUME_FORMATS.some((f) => f.ext === ext)) return 'Upload a PDF, Word (DOC/DOCX), ODT, RTF or TXT file';
    if (file.size > maxResumeMb * 1024 * 1024) return `File is too large — the limit is ${maxResumeMb} MB`;
    return null;
  }

  function pickFile(e) {
    const file = e.target.files?.[0] ?? null;
    const err = file ? checkFile(file) : null;
    setErrors((x) => ({ ...x, resume: err ?? undefined }));
    setResume(err ? null : file);
    if (err) e.target.value = '';
  }

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (form.fullName.trim().length < 2) errs.fullName = 'Enter your full name';
    if (!EMAIL_RX.test(form.email.trim())) errs.email = 'Enter a valid email address';
    if (form.phone && !/^[+\d\s().-]{5,30}$/.test(form.phone.trim())) errs.phone = 'Enter a valid phone number';
    if (form.coverLetter.length > 5000) errs.coverLetter = 'Cover letter must be 5000 characters or fewer';
    for (const q of questions) {
      const a = (answers[q._id] ?? '').toString().trim();
      if (q.required && !a) errs[`answers.${q._id}`] = 'This question is required';
      else if (a && q.type === 'number' && !(Number(a) >= 0)) errs[`answers.${q._id}`] = 'Enter a valid number';
    }
    const fileErr = checkFile(resume);
    if (fileErr) errs.resume = fileErr;
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0];
      document.getElementById(first.startsWith('answers.') ? `q-${first.slice(8)}` : `apply-${first}`)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v.trim()));
      fd.append('answers', JSON.stringify(answers));
      fd.append('resume', resume);
      await api(`/public/jobs/${job._id}/apply`, { method: 'POST', form: fd });
      setDone(true);
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div ref={successRef} tabIndex={-1} role="status" className="py-6 text-center focus:outline-none">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden />
        </div>
        <h2 className="text-xl font-semibold">Application submitted!</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
          Thanks for applying for <strong>{job.title}</strong>. Our team will review your application and get in touch.
        </p>
        <Link href="/careers" className="mt-5 inline-block text-sm font-medium text-blue-600 hover:underline">
          Browse more roles
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-labelledby="apply-heading">
      <h2 id="apply-heading" className="text-lg font-semibold">
        Apply for this role
      </h2>
      {formError && <Alert>{formError}</Alert>}
      <TextInput id="apply-fullName" label="Full name" required autoComplete="name" value={form.fullName} onChange={set('fullName')} error={errors.fullName} />
      <TextInput id="apply-email" label="Email" type="email" required autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
      <TextInput id="apply-phone" label="Phone" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} error={errors.phone} hint="Optional" />

      {questions.length > 0 && (
        <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-800">A few questions</legend>
          {questions.map((q) => {
            const err = errors[`answers.${q._id}`];
            const setA = (v) => {
              setAnswers((x) => ({ ...x, [q._id]: v }));
              setErrors((x) => ({ ...x, [`answers.${q._id}`]: undefined }));
            };
            if (q.type === 'yes_no') {
              return (
                <div key={q._id} role="radiogroup" aria-labelledby={`ql-${q._id}`} aria-describedby={err ? `qe-${q._id}` : undefined}>
                  <p id={`ql-${q._id}`} className="mb-1.5 text-sm font-medium text-slate-700">
                    {q.question}
                    {q.required && <span aria-hidden="true" className="text-rose-600"> *</span>}
                  </p>
                  <div className="flex gap-2">
                    {['yes', 'no'].map((v, i) => (
                      <label
                        key={v}
                        className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-blue-500 ${answers[q._id] === v ? 'border-blue-500 bg-blue-50 font-medium text-blue-800' : err ? 'border-rose-400' : 'border-slate-300'}`}
                      >
                        <input id={i === 0 ? `q-${q._id}` : undefined} type="radio" name={`q-${q._id}`} value={v} checked={answers[q._id] === v} onChange={() => setA(v)} className="sr-only" />
                        {v === 'yes' ? 'Yes' : 'No'}
                      </label>
                    ))}
                  </div>
                  {err && (
                    <p id={`qe-${q._id}`} className="mt-1 text-xs font-medium text-rose-600">
                      {err}
                    </p>
                  )}
                </div>
              );
            }
            const Input = q.type === 'number' ? TextInput : TextArea;
            return (
              <Input
                key={q._id}
                id={`q-${q._id}`}
                label={q.question}
                required={q.required}
                {...(q.type === 'number' ? { type: 'number', min: 0, inputMode: 'numeric' } : { rows: 2 })}
                value={answers[q._id] ?? ''}
                onChange={(e) => setA(e.target.value)}
                error={err}
              />
            );
          })}
        </fieldset>
      )}

      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-700" id="apply-resume-label">
          Résumé <span aria-hidden="true" className="text-rose-600">*</span>
        </p>
        {resume ? (
          <div className="flex items-center gap-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5">
            <FileUp className="h-5 w-5 text-blue-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{resume.name}</p>
              <p className="text-xs text-slate-500">{formatBytes(resume.size)}</p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Remove file"
              onClick={() => {
                setResume(null);
                if (fileRef.current) fileRef.current.value = '';
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <label
            htmlFor="apply-resume"
            className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm focus-within:ring-2 focus-within:ring-blue-500 hover:bg-slate-50 ${errors.resume ? 'border-rose-400' : 'border-slate-300'}`}
          >
            <FileUp className="h-6 w-6 text-slate-400" aria-hidden />
            <span className="font-medium text-blue-700">Choose a file</span>
            <span className="text-xs text-slate-500">PDF, DOC, DOCX, ODT, RTF or TXT · max {maxResumeMb} MB</span>
          </label>
        )}
        <input
          ref={fileRef}
          id="apply-resume"
          type="file"
          accept={RESUME_FORMATS.map((f) => f.ext).join(',')}
          onChange={pickFile}
          className="sr-only"
          aria-labelledby="apply-resume-label"
          aria-describedby="apply-resume-hint"
          aria-invalid={errors.resume ? true : undefined}
        />
        <p id="apply-resume-hint" className={`mt-1 text-xs ${errors.resume ? 'font-medium text-rose-600' : 'text-slate-500'}`}>
          {errors.resume || `Accepted formats: PDF, DOC, DOCX, ODT, RTF, TXT. Maximum size: ${maxResumeMb} MB.`}
        </p>
      </div>

      <TextArea id="apply-coverLetter" label="Cover letter" rows={6} value={form.coverLetter} onChange={set('coverLetter')} error={errors.coverLetter} hint={`Optional · ${form.coverLetter.length}/5000`} />
      <Button type="submit" loading={submitting} className="w-full">
        Submit application
      </Button>
      <p className="text-center text-xs text-slate-500">
        Your details are only visible to our hiring team.{' '}
        {job.aiScreening === 'auto'
          ? 'We use automated AI screening to compare applications with this job’s requirements, and it may decide whether your application moves forward. It considers only job-related qualifications. You can ask us for a person to review your application.'
          : job.aiScreening === 'review'
            ? 'We use AI to help screen applications against this job’s requirements. It considers only job-related qualifications, and a person confirms every rejection.'
            : 'We may use AI to help summarise applications, but a person reviews every application and makes all decisions.'}
      </p>
    </form>
  );
}

function Detail({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{children}</dd>
    </div>
  );
}

export default function PublicJobPage() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi(`/public/jobs/${id}`);

  useEffect(() => {
    if (data?.job) document.title = `${data.job.title} · Careers`;
  }, [data]);

  if (loading) return <LoadingState />;
  if (error)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ErrorState error={error.status === 404 ? { status: 404, message: 'This job does not exist or is no longer listed.' } : error} onRetry={reload} />
        <p className="mt-2 text-center">
          <Link href="/careers#roles" className="text-sm font-medium text-blue-700 hover:underline">
            See all open roles
          </Link>
        </p>
      </div>
    );

  const { job, maxResumeMb } = data;
  const salary = formatSalary(job);
  const closed = job.status !== 'published';

  return (
    <>
      <div className="border-b border-slate-200 bg-slate-50/70">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
            <Link href="/careers#roles" className="inline-flex items-center gap-1 hover:text-slate-900">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All roles
            </Link>
            <span aria-hidden className="mx-2 text-slate-300">/</span>
            <span>{job.department}</span>
          </nav>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-4xl">{job.title}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-slate-600">
            <span>{job.location}</span>
            <span aria-hidden className="text-slate-300">•</span>
            <span>{remoteLabel(job.remotePolicy)}</span>
            <span aria-hidden className="text-slate-300">•</span>
            <span>{employmentLabel(job.employmentType)}</span>
            {salary && (
              <>
                <span aria-hidden className="text-slate-300">•</span>
                <span>{salary}</span>
              </>
            )}
          </p>
          {!closed && (
            <a href="#apply" className="mt-6 inline-flex h-11 items-center rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800">
              Apply for this job
            </a>
          )}
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          {closed && (
            <div role="status" className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
              <p className="flex items-center gap-2 font-semibold text-amber-900">
                <Briefcase className="h-4 w-4" aria-hidden /> Applications closed
              </p>
              <p className="mt-1 text-sm text-amber-800">This role is no longer accepting applications.</p>
              <Link href="/careers#roles" className="mt-3 inline-block text-sm font-medium text-amber-900 underline">
                See open roles
              </Link>
            </div>
          )}

          <div className="max-w-prose space-y-9">
            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-900">About the role</h2>
              <Markdownish text={job.description} />
            </section>
            {job.responsibilities && (
              <section>
                <h2 className="mb-3 text-xl font-semibold text-slate-900">What you’ll do</h2>
                <Markdownish text={job.responsibilities} />
              </section>
            )}
            {job.requirements && (
              <section>
                <h2 className="mb-3 text-xl font-semibold text-slate-900">What we’re looking for</h2>
                <Markdownish text={job.requirements} />
              </section>
            )}
          </div>

          {!closed && (
            <section id="apply" className="mt-12 scroll-mt-20 rounded-2xl border border-slate-200 p-5 sm:p-8">
              <ApplyForm job={job} maxResumeMb={maxResumeMb} />
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-900">Job details</h2>
            <dl className="mt-2 divide-y divide-slate-100">
              <Detail label="Team">{job.department}</Detail>
              <Detail label="Location">{job.location}</Detail>
              <Detail label="Workplace">{remoteLabel(job.remotePolicy)}</Detail>
              <Detail label="Type">{employmentLabel(job.employmentType)}</Detail>
              {salary && <Detail label="Salary">{salary}</Detail>}
              {job.publishedAt && <Detail label="Posted">{formatDate(job.publishedAt)}</Detail>}
            </dl>
            {!closed && (
              <a href="#apply" className="mt-4 flex h-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700">
                Apply now
              </a>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
