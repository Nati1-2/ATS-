'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, useApi } from '@/lib/api';
import { AI_SCREEN_MODES, EDUCATION_LEVELS, EMPLOYMENT_TYPES, REMOTE_POLICIES } from '@/lib/constants';
import { QuestionsEditor, SkillInput } from './ScreeningEditor';
import { Alert, Button, ButtonLink, Card, SelectInput, TextArea, TextInput, useToast } from './ui';

const EMPTY = {
  title: '',
  department: '',
  location: '',
  remotePolicy: '',
  employmentType: '',
  description: '',
  responsibilities: '',
  requirements: '',
  salaryMin: '',
  salaryMax: '',
  currency: 'USD',
  hiringManagers: [],
  mustHaveSkills: [],
  niceToHaveSkills: [],
  screeningQuestions: [],
  autoRejectKnockouts: false,
  minYearsExperience: '',
  minEducation: '',
  autoScreen: { rejectBelowScore: '', rejectMissingMustHave: false, rejectBelowMinYears: false, rejectMissingEducation: false, advanceAtScore: '' },
  aiScreen: { mode: 'off', rejectBelowFit: '', rejectMissingMustHave: false, advanceAtFit: '' },
};

function validate(f) {
  const e = {};
  if (f.title.trim().length < 3) e.title = 'Title must be at least 3 characters';
  if (!f.department.trim()) e.department = 'Department is required';
  if (!f.location.trim()) e.location = 'Location is required';
  if (!f.remotePolicy) e.remotePolicy = 'Select a remote policy';
  if (!f.employmentType) e.employmentType = 'Select an employment type';
  if (f.description.trim().length < 20) e.description = 'Description must be at least 20 characters';
  const min = f.salaryMin === '' ? null : Number(f.salaryMin);
  const max = f.salaryMax === '' ? null : Number(f.salaryMax);
  if (min !== null && (Number.isNaN(min) || min < 0)) e.salaryMin = 'Must be 0 or more';
  if (max !== null && (Number.isNaN(max) || max < 0)) e.salaryMax = 'Must be 0 or more';
  if (min !== null && max !== null && min > max) e.salaryMax = 'Maximum must be greater than or equal to minimum';
  if (f.currency && !/^[A-Za-z]{3}$/.test(f.currency)) e.currency = 'Use a 3-letter currency code';
  const rej = f.autoScreen.rejectBelowScore === '' ? null : Number(f.autoScreen.rejectBelowScore);
  const adv = f.autoScreen.advanceAtScore === '' ? null : Number(f.autoScreen.advanceAtScore);
  if (rej !== null && !(rej >= 1 && rej <= 100)) e['autoScreen.rejectBelowScore'] = 'Enter 1–100';
  if (adv !== null && !(adv >= 1 && adv <= 100)) e['autoScreen.advanceAtScore'] = 'Enter 1–100';
  else if (rej !== null && adv !== null && adv <= rej) e['autoScreen.advanceAtScore'] = 'Must be higher than the reject score';
  const yrs = f.minYearsExperience === '' ? null : Number(f.minYearsExperience);
  if (yrs !== null && !(yrs >= 0 && yrs <= 50)) e.minYearsExperience = 'Enter 0–50';
  if (f.autoScreen.rejectBelowMinYears && yrs === null) e.minYearsExperience = 'Set the minimum years to use this rule';
  if (f.autoScreen.rejectMissingEducation && !f.minEducation) e.minEducation = 'Choose the minimum education to use this rule';
  const hasSkills = f.mustHaveSkills.length || f.niceToHaveSkills.length || yrs !== null || f.minEducation;
  const ai = f.aiScreen;
  const aiRej = ai.rejectBelowFit === '' ? null : Number(ai.rejectBelowFit);
  const aiAdv = ai.advanceAtFit === '' ? null : Number(ai.advanceAtFit);
  if (ai.mode !== 'off') {
    if (aiRej !== null && !(aiRej >= 1 && aiRej <= 100)) e['aiScreen.rejectBelowFit'] = 'Enter 1–100';
    else if (aiAdv !== null && !(aiAdv >= 1 && aiAdv <= 100)) e['aiScreen.advanceAtFit'] = 'Enter 1–100';
    else if (aiRej !== null && aiAdv !== null && aiAdv <= aiRej) e['aiScreen.advanceAtFit'] = 'Must be higher than the reject fit';
    else if (aiRej === null && aiAdv === null && !ai.rejectMissingMustHave) e['aiScreen.rejectBelowFit'] = 'Set at least one AI rule, or turn AI screening off';
    if (ai.rejectMissingMustHave && !f.mustHaveSkills.length) e['aiScreen.rejectBelowFit'] = 'Add must-have skills to use this rule';
  }
  if (!hasSkills && (rej !== null || adv !== null || f.autoScreen.rejectMissingMustHave)) e['autoScreen.rejectBelowScore'] = 'Add skills above so CVs can be scored';
  f.screeningQuestions.forEach((q, i) => {
    if (q.question.trim().length < 3) e[`screeningQuestions.${i}.question`] = 'Enter the question';
  });
  return e;
}

function AutoDecisionRules({ form, setForm, errors, setErrors }) {
  const r = form.autoScreen;
  const setRule = (patch) => {
    setForm((f) => ({ ...f, autoScreen: { ...f.autoScreen, ...patch } }));
    setErrors((x) => ({ ...x, 'autoScreen.rejectBelowScore': undefined, 'autoScreen.advanceAtScore': undefined }));
  };
  const numberInput = (key, id) => (
    <input
      id={id}
      type="number"
      min="1"
      max="100"
      inputMode="numeric"
      value={r[key]}
      onChange={(e) => setRule({ [key]: e.target.value })}
      aria-invalid={errors[`autoScreen.${key}`] ? true : undefined}
      className={`w-20 rounded-md border bg-white px-2 py-1 text-sm ${errors[`autoScreen.${key}`] ? 'border-rose-400' : 'border-slate-300'}`}
    />
  );
  const summary = [];
  if (form.autoRejectKnockouts) summary.push('fail a knockout question');
  if (r.rejectMissingMustHave) summary.push('miss any must-have skill');
  if (r.rejectBelowMinYears && form.minYearsExperience !== '') summary.push(`have under ${form.minYearsExperience} years of experience`);
  if (r.rejectMissingEducation && form.minEducation) summary.push('are below the minimum education');
  if (r.rejectBelowScore !== '') summary.push(`match below ${r.rejectBelowScore}%`);
  return (
    <div className="border-t border-slate-200 pt-5">
      <h3 className="text-sm font-semibold text-slate-800">Automatic decisions from the CV</h3>
      <p className="mb-3 mt-1 text-xs text-slate-500">
        These rules run the moment someone applies. Leave a box empty to turn that rule off. Nobody is rejected because of something the system couldn’t read: unreadable CVs, unknown experience or a missing degree go to a person for review, and so does suspected keyword stuffing.
      </p>
      <div className="space-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={r.rejectMissingMustHave} onChange={(e) => setRule({ rejectMissingMustHave: e.target.checked })} />
          <span>Reject if <strong>any must-have skill</strong> is missing from the CV</span>
        </label>
        <label className={`flex items-center gap-2 ${form.minYearsExperience === '' ? 'text-slate-400' : ''}`}>
          <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={r.rejectBelowMinYears} onChange={(e) => setRule({ rejectBelowMinYears: e.target.checked })} />
          <span>Reject if the CV shows <strong>fewer years of experience</strong> than the minimum</span>
        </label>
        <label className={`flex items-center gap-2 ${!form.minEducation ? 'text-slate-400' : ''}`}>
          <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={r.rejectMissingEducation} onChange={(e) => setRule({ rejectMissingEducation: e.target.checked })} />
          <span>Reject if the CV's <strong>education is below</strong> the minimum</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="rule-reject">Reject if CV match is below</label>
          {numberInput('rejectBelowScore', 'rule-reject')}
          <span>%</span>
          {errors['autoScreen.rejectBelowScore'] && <span className="text-xs font-medium text-rose-600">{errors['autoScreen.rejectBelowScore']}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="rule-advance">Shortlist (move to Screening) if CV match is at least</label>
          {numberInput('advanceAtScore', 'rule-advance')}
          <span>%</span>
          {errors['autoScreen.advanceAtScore'] && <span className="text-xs font-medium text-rose-600">{errors['autoScreen.advanceAtScore']}</span>}
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-inset ring-slate-200">
        <p>
          <strong className="text-rose-700">Rejected</strong> if they {summary.length ? summary.join(', or ') : '— (no reject rules)'}.
        </p>
        <p className="mt-1">
          <strong className="text-emerald-700">Shortlisted</strong>{' '}
          {r.advanceAtScore !== '' ? `if they pass every knockout and match ${r.advanceAtScore}% or more.` : '— (no shortlist rule)'}
        </p>
        <p className="mt-1">
          <strong className="text-slate-800">Needs review</strong>: everyone else stays in Applied for a recruiter.
        </p>
      </div>
    </div>
  );
}

function AiScreeningRules({ form, setForm, errors, setErrors }) {
  const r = form.aiScreen;
  const on = r.mode !== 'off';
  const setRule = (patch) => {
    setForm((f) => ({ ...f, aiScreen: { ...f.aiScreen, ...patch } }));
    setErrors((x) => ({ ...x, 'aiScreen.rejectBelowFit': undefined, 'aiScreen.advanceAtFit': undefined }));
  };
  const numberInput = (key, id) => (
    <input
      id={id}
      type="number"
      min="1"
      max="100"
      inputMode="numeric"
      value={r[key]}
      disabled={!on}
      onChange={(e) => setRule({ [key]: e.target.value })}
      aria-invalid={errors[`aiScreen.${key}`] ? true : undefined}
      className={`w-20 rounded-md border bg-white px-2 py-1 text-sm disabled:bg-slate-50 ${errors[`aiScreen.${key}`] ? 'border-rose-400' : 'border-slate-300'}`}
    />
  );
  return (
    <div className="border-t border-slate-200 pt-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        AI screening <span className="rounded bg-violet-100 px-1 py-px text-[9px] font-bold text-violet-700">AI</span>
      </h3>
      <p className="mb-3 mt-1 text-xs text-slate-500">
        After the rules above, the AI reads each CV in meaning, not keywords, and gives a 0–100% fit. These rules turn that fit into decisions. They only affect applicants still in Applied who nobody has moved, and unreadable CVs, manipulation attempts and scanned files always go to a person.
      </p>
      <fieldset>
        <legend className="sr-only">How much the AI may decide</legend>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {AI_SCREEN_MODES.map((m) => (
            <label key={m.value} className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${r.mode === m.value ? 'border-violet-500 bg-violet-50' : 'border-slate-300 bg-white'}`}>
              <input type="radio" name="ai-mode" className="mt-0.5 h-4 w-4 accent-violet-600" checked={r.mode === m.value} onChange={() => setRule({ mode: m.value })} />
              <span>
                <span className="block font-medium text-slate-800">{m.short}</span>
                <span className="block text-xs text-slate-500">{m.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className={`mt-4 space-y-3 text-sm ${on ? '' : 'text-slate-400'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="ai-rule-reject">{r.mode === 'review' ? 'Recommend rejecting' : 'Reject'} if AI fit is below</label>
          {numberInput('rejectBelowFit', 'ai-rule-reject')}
          <span>%</span>
          {errors['aiScreen.rejectBelowFit'] && <span className="text-xs font-medium text-rose-600">{errors['aiScreen.rejectBelowFit']}</span>}
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-violet-600" disabled={!on} checked={r.rejectMissingMustHave} onChange={(e) => setRule({ rejectMissingMustHave: e.target.checked })} />
          <span>{r.mode === 'review' ? 'Recommend rejecting' : 'Reject'} if the AI finds <strong>no evidence of a must-have skill</strong> (judged by meaning)</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="ai-rule-advance">Shortlist (move to Screening) if AI fit is at least</label>
          {numberInput('advanceAtFit', 'ai-rule-advance')}
          <span>%</span>
          {errors['aiScreen.advanceAtFit'] && <span className="text-xs font-medium text-rose-600">{errors['aiScreen.advanceAtFit']}</span>}
        </div>
      </div>
      {on && (
        <p className="mt-3 rounded-lg bg-violet-50 p-3 text-xs text-violet-900 ring-1 ring-inset ring-violet-200">
          Typical starting point: reject below 35%, shortlist at 80%. Watch the overturn rate on the AI screening page and adjust. Check that automated screening is allowed where you hire (for example NYC Local Law 144 and the EU AI Act set rules for it).
        </p>
      )}
    </div>
  );
}

export default function JobForm({ job }) {
  const router = useRouter();
  const toast = useToast();
  const team = useApi('/settings/team');
  const [form, setForm] = useState(() =>
    job
      ? {
          ...EMPTY,
          ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, job[k] ?? EMPTY[k]])),
          salaryMin: job.salaryMin ?? '',
          salaryMax: job.salaryMax ?? '',
          hiringManagers: (job.hiringManagers || []).map((h) => h._id ?? h),
          minYearsExperience: job.minYearsExperience ?? '',
          minEducation: job.minEducation ?? '',
          autoScreen: {
            rejectBelowScore: job.autoScreen?.rejectBelowScore ?? '',
            rejectMissingMustHave: Boolean(job.autoScreen?.rejectMissingMustHave),
            rejectBelowMinYears: Boolean(job.autoScreen?.rejectBelowMinYears),
            rejectMissingEducation: Boolean(job.autoScreen?.rejectMissingEducation),
            advanceAtScore: job.autoScreen?.advanceAtScore ?? '',
          },
          aiScreen: {
            mode: job.aiScreen?.mode || 'off',
            rejectBelowFit: job.aiScreen?.rejectBelowFit ?? '',
            rejectMissingMustHave: Boolean(job.aiScreen?.rejectMissingMustHave),
            advanceAtFit: job.aiScreen?.advanceAtFit ?? '',
          },
        }
      : EMPTY
  );
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(null);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((x) => (x[k] ? { ...x, [k]: undefined } : x));
  };
  const managers = (team.data?.users || []).filter((u) => u.role === 'hiring_manager');
  const isPublished = job?.status === 'published';

  async function save(publish) {
    const errs = validate(form);
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) {
      setFormError('Please fix the highlighted fields.');
      const first = Object.keys(errs)[0];
      const focusId = first.startsWith('screeningQuestions.')
        ? `q-${first.split('.')[1]}`
        : first.startsWith('autoScreen.')
          ? first.endsWith('advanceAtScore') ? 'rule-advance' : 'rule-reject'
          : first.startsWith('aiScreen.')
            ? first.endsWith('advanceAtFit') ? 'ai-rule-advance' : 'ai-rule-reject'
            : `job-${first}`;
      document.getElementById(focusId)?.focus();
      return;
    }
    setSaving(publish ? 'publish' : 'draft');
    try {
      const body = { ...form, currency: form.currency.toUpperCase() || 'USD', ...(publish ? { status: 'published' } : job ? {} : { status: 'draft' }) };
      const res = job ? await api(`/jobs/${job._id}`, { method: 'PUT', body }) : await api('/jobs', { method: 'POST', body });
      toast(publish ? 'Job published' : job ? (res.rescored ? `Changes saved · ${res.rescored} applicants re-scored` : 'Changes saved') : 'Draft saved');
      router.push(`/jobs/${res.job._id}`);
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(err.message);
      setSaving(null);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
      className="space-y-6"
    >
      {formError && <Alert>{formError}</Alert>}

      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="text-base font-semibold">Basics</h2>
        <TextInput id="job-title" label="Job title" required value={form.title} onChange={set('title')} error={errors.title} placeholder="e.g. Senior Frontend Engineer" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextInput id="job-department" label="Department" required value={form.department} onChange={set('department')} error={errors.department} placeholder="e.g. Engineering" />
          <TextInput id="job-location" label="Location" required value={form.location} onChange={set('location')} error={errors.location} placeholder="e.g. Berlin, Germany" />
          <SelectInput id="job-remotePolicy" label="Remote policy" required placeholder="Select…" options={REMOTE_POLICIES} value={form.remotePolicy} onChange={set('remotePolicy')} error={errors.remotePolicy} />
          <SelectInput id="job-employmentType" label="Employment type" required placeholder="Select…" options={EMPLOYMENT_TYPES} value={form.employmentType} onChange={set('employmentType')} error={errors.employmentType} />
        </div>
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="text-base font-semibold">Description</h2>
        <p className="-mt-3 text-xs text-slate-500">Plain text. Start a line with “-” to create a bullet point.</p>
        <TextArea id="job-description" label="About the role" required rows={6} value={form.description} onChange={set('description')} error={errors.description} />
        <TextArea id="job-responsibilities" label="Responsibilities" rows={5} value={form.responsibilities} onChange={set('responsibilities')} error={errors.responsibilities} placeholder="- Build…" />
        <TextArea id="job-requirements" label="Requirements" rows={5} value={form.requirements} onChange={set('requirements')} error={errors.requirements} placeholder="- 3+ years…" />
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <div>
          <h2 className="text-base font-semibold">CV screening</h2>
          <p className="mt-1 text-xs text-slate-500">
            Each CV gets a 0–100% match from must-have skills (45), nice-to-have skills (15), years of experience (20), job title (10) and education (10). Only the parts you set are counted.
            Common synonyms are built in (K8s = Kubernetes, JS = JavaScript); add your own with “|”, e.g. “Node.js | Node”.
          </p>
        </div>
        <SkillInput id="job-mustHaveSkills" label="Must-have skills" value={form.mustHaveSkills} onChange={(v) => setForm((f) => ({ ...f, mustHaveSkills: v }))} />
        <SkillInput id="job-niceToHaveSkills" label="Nice-to-have skills" tone="slate" value={form.niceToHaveSkills} onChange={(v) => setForm((f) => ({ ...f, niceToHaveSkills: v }))} />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextInput
            id="job-minYearsExperience"
            label="Minimum years of experience"
            type="number"
            min="0"
            max="50"
            inputMode="numeric"
            value={form.minYearsExperience}
            onChange={set('minYearsExperience')}
            error={errors.minYearsExperience}
            hint="Optional · read from job dates on the CV"
          />
          <SelectInput
            id="job-minEducation"
            label="Minimum education"
            placeholder="No requirement"
            options={EDUCATION_LEVELS}
            value={form.minEducation}
            onChange={set('minEducation')}
            error={errors.minEducation}
            hint="Optional"
          />
        </div>
        {job && <p className="text-xs text-slate-500">Changing skills, experience, education or the job title re-scores everyone who has already applied.</p>}
        <div className="border-t border-slate-200 pt-5">
          <h3 className="text-sm font-semibold text-slate-800">Screening questions</h3>
          <p className="mb-3 mt-1 text-xs text-slate-500">
            Applicants answer these when they apply. A <strong>knockout</strong> question flags applicants who give a disqualifying answer. Applicants never see which answers disqualify them.
          </p>
          <QuestionsEditor value={form.screeningQuestions} onChange={(v) => setForm((f) => ({ ...f, screeningQuestions: v }))} errors={errors} />
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={form.autoRejectKnockouts} onChange={(e) => setForm((f) => ({ ...f, autoRejectKnockouts: e.target.checked }))} />
            <span>
              <span className="font-medium text-slate-800">Automatically reject applicants who fail a knockout question</span>
              <span className="block text-xs text-slate-500">If this is off, they stay in Applied and are flagged with “Failed screening”.</span>
            </span>
          </label>
        </div>
        <AutoDecisionRules form={form} setForm={setForm} errors={errors} setErrors={setErrors} />
        <AiScreeningRules form={form} setForm={setForm} errors={errors} setErrors={setErrors} />
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="text-base font-semibold">Compensation & team</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <TextInput id="job-salaryMin" label="Salary minimum" type="number" min="0" inputMode="numeric" value={form.salaryMin} onChange={set('salaryMin')} error={errors.salaryMin} hint="Optional" />
          <TextInput id="job-salaryMax" label="Salary maximum" type="number" min="0" inputMode="numeric" value={form.salaryMax} onChange={set('salaryMax')} error={errors.salaryMax} hint="Optional" />
          <TextInput id="job-currency" label="Currency" maxLength={3} value={form.currency} onChange={set('currency')} error={errors.currency} hint="ISO code, e.g. USD, EUR, ETB" />
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Hiring managers</legend>
          <p className="mb-2 text-xs text-slate-500">Assigned hiring managers can review this job&apos;s candidates and leave feedback.</p>
          {team.loading ? (
            <p className="text-sm text-slate-500">Loading team…</p>
          ) : managers.length === 0 ? (
            <p className="text-sm text-slate-500">No hiring managers on the team yet. Invite one from Settings.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {managers.map((m) => {
                const checked = form.hiringManagers.includes(m.id);
                return (
                  <label key={m.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white'}`}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-blue-600"
                      checked={checked}
                      onChange={() =>
                        setForm((f) => ({
                          ...f,
                          hiringManagers: checked ? f.hiringManagers.filter((id) => id !== m.id) : [...f.hiringManagers, m.id],
                        }))
                      }
                    />
                    {m.name}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <ButtonLink href={job ? `/jobs/${job._id}` : '/jobs'} variant="secondary">
          Cancel
        </ButtonLink>
        <Button type="submit" variant="secondary" loading={saving === 'draft'} disabled={Boolean(saving)}>
          {job ? 'Save changes' : 'Save as draft'}
        </Button>
        {!isPublished && (
          <Button onClick={() => save(true)} loading={saving === 'publish'} disabled={Boolean(saving)}>
            {job ? 'Save & publish' : 'Publish job'}
          </Button>
        )}
      </div>
    </form>
  );
}
