'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Download, FileCheck2, RotateCcw, Upload, Wand2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatBytes, RESUME_FORMATS } from '@/lib/constants';
import { Alert, Badge, Button, Card, ConfirmDialog, cx, Spinner, TextArea, useToast } from '@/components/ui';

/** Everything the review flagged, as fixable items. High-impact ones start ticked. */
function fixOptions(check) {
  const rv = check.review || {};
  const opts = [];
  for (const w of rv.weaknesses || []) opts.push({ text: `${w.issue} — ${w.fix}`, area: 'Weakness', on: true });
  for (const s of rv.suggestions || []) opts.push({ text: s.suggestion, area: `Suggestion · ${s.area}`, on: s.priority === 'high' });
  if (rv.rewrites?.length) opts.push({ text: 'Use stronger versions of the weak lines the review pointed out.', area: 'Rewrites', on: true });
  for (const c of check.quick?.checks || []) if (c.status !== 'pass' && c.id !== 'keywords') opts.push({ text: `${c.label}: ${c.detail}`, area: 'ATS check', on: c.status === 'fail' });
  const seen = new Set();
  return opts.filter((o) => !seen.has(o.text) && seen.add(o.text));
}

function missingSkills(check) {
  const jm = check.quick?.jobMatch;
  return [...new Set([...(jm?.missingMustHave || []), ...(jm?.missingNiceToHave || []), ...(check.review?.missingKeywords || [])])].slice(0, 15);
}

function FixForm({ check, onStarted }) {
  const toast = useToast();
  const options = useMemo(() => fixOptions(check), [check]);
  const skills = useMemo(() => missingSkills(check), [check]);
  const prev = check.fix;
  const [chosen, setChosen] = useState(() => new Set(prev?.items?.length ? prev.items : options.filter((o) => o.on).map((o) => o.text)));
  const [haveSkills, setHaveSkills] = useState(() => new Set(prev?.skills || []));
  const [notes, setNotes] = useState(prev?.notes || '');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const needsFile = check.hasCvText === false;

  const toggle = (set, setter, v) => {
    const next = new Set(set);
    next.has(v) ? next.delete(v) : next.add(v);
    setter(next);
  };

  async function start() {
    setBusy(true);
    setError('');
    const payload = { items: [...chosen], skills: [...haveSkills], notes };
    try {
      let req = { method: 'POST', body: payload };
      if (file) {
        const fd = new FormData();
        fd.append('resume', file);
        fd.append('payload', JSON.stringify(payload));
        req = { method: 'POST', form: fd };
      }
      const { check: updated } = await api(`/cv-checker/${check._id}/fix`, req);
      setConfirm(false);
      onStarted(updated);
    } catch (err) {
      // Shown in the panel: a toast would be hidden behind the open dialog
      setConfirm(false);
      setError(Object.values(err.fields || {})[0] || err.message);
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-900">What should be fixed?</legend>
        <ul className="space-y-1.5">
          {options.map((o) => (
            <li key={o.text}>
              <label className="flex cursor-pointer gap-2.5 rounded-lg p-2 text-sm hover:bg-slate-50">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600" checked={chosen.has(o.text)} onChange={() => toggle(chosen, setChosen, o.text)} />
                <span className="min-w-0">
                  <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{o.area}</span>
                  <span className="text-slate-800">{o.text}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {skills.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium text-slate-900">Missing skills: tick only the ones you really have</legend>
          <p className="mb-2 text-xs text-slate-500">Unticked skills are never added, so the CV stays honest.</p>
          <div className="flex flex-wrap gap-2">
            {skills.map((s) => {
              const on = haveSkills.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(haveSkills, setHaveSkills, s)}
                  className={cx('inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset', on ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}
                >
                  {on && <Check className="h-3 w-3" aria-hidden />} {s}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <TextArea
        id="fix-notes"
        label="Anything to add? (optional)"
        hint="Real numbers, achievements, tools or roles the CV leaves out. The AI uses only what you write here and what is already in the CV."
        rows={3}
        maxLength={3000}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="e.g. The dashboard I built is used by 3,000 people; I cut report time from 2 days to 2 hours."
      />

      {needsFile && (
        <div>
          <p className="text-sm font-medium text-slate-900">Upload the CV again</p>
          <p className="mb-2 text-xs text-slate-500">This check was made before CV fixing was available, so the CV text wasn’t kept. Choose the same file to rewrite it.</p>
          <label htmlFor="fix-file" className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
            <Upload className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            {file ? (
              <span className="truncate font-medium text-slate-900">
                {file.name} <span className="font-normal text-slate-500">· {formatBytes(file.size)}</span>
              </span>
            ) : (
              <span className="font-medium text-blue-700">Choose the CV file</span>
            )}
          </label>
          <input
            id="fix-file"
            type="file"
            className="sr-only"
            accept={RESUME_FORMATS.map((f) => f.ext).join(',')}
            onChange={(e) => {
              setFile(e.target.files[0] || null);
              setError('');
            }}
          />
        </div>
      )}

      {error && <Alert>{error}</Alert>}

      <Button onClick={() => setConfirm(true)} disabled={!chosen.size || (needsFile && !file)} className="w-full sm:w-auto">
        <Wand2 className="h-4 w-4" aria-hidden /> Fix {chosen.size} item{chosen.size === 1 ? '' : 's'}
      </Button>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        loading={busy}
        title="Rewrite this CV?"
        message={`The AI will rewrite the CV to fix ${chosen.size} item${chosen.size === 1 ? '' : 's'}${haveSkills.size ? ` and add ${haveSkills.size} skill${haveSkills.size === 1 ? '' : 's'} you confirmed` : ''}. It uses only facts in the CV and what you added; anything it doesn't know is left as a [placeholder] for you to fill in. Your original report is kept.`}
        confirmLabel="Yes, fix my CV"
        onConfirm={start}
      />
    </div>
  );
}

function FixResult({ check, onRedo }) {
  const toast = useToast();
  const router = useRouter();
  const [rechecking, setRechecking] = useState(false);
  const { improvedCv, changes, stillMissing } = check.fix.result;

  async function copy() {
    try {
      await navigator.clipboard.writeText(improvedCv);
      toast('Improved CV copied');
    } catch {
      toast('Could not copy. Select the text and copy it instead.', 'error');
    }
  }

  async function recheck() {
    setRechecking(true);
    try {
      const fd = new FormData();
      fd.append('text', improvedCv);
      if (check.job) fd.append('jobId', check.job);
      else if (check.targetRole) fd.append('targetRole', check.targetRole);
      const { check: next } = await api('/cv-checker', { method: 'POST', form: fd });
      router.push(`/cv-checker?id=${next._id}`);
    } catch (err) {
      toast(err.message, 'error');
      setRechecking(false);
    }
  }

  return (
    <div className="space-y-5">
      {changes.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-900">What changed</h3>
          <ul className="space-y-1.5">
            {changes.map((c, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                <span>
                  {c.area && <Badge className="mr-1.5 bg-slate-100 text-slate-700 ring-slate-300">{c.area}</Badge>}
                  {c.change}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stillMissing.length > 0 && (
        <Alert kind="info">
          <p className="font-medium">Fill in these placeholders before you send it:</p>
          <ul className="mt-1 list-disc pl-5">
            {stillMissing.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-900">Improved CV</h3>
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-sans text-sm leading-relaxed text-slate-800 ring-1 ring-inset ring-slate-200">{improvedCv}</pre>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={recheck} loading={rechecking}>
          {!rechecking && <FileCheck2 className="h-4 w-4" aria-hidden />} Check the improved CV
        </Button>
        <a href={`/api/cv-checker/${check._id}/fix.docx`} className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-xs ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
          <Download className="h-4 w-4" aria-hidden /> Download .docx
        </a>
        <Button variant="secondary" onClick={copy}>
          <Copy className="h-4 w-4" aria-hidden /> Copy text
        </Button>
        <Button variant="secondary" onClick={onRedo}>
          <RotateCcw className="h-4 w-4" aria-hidden /> Change what to fix
        </Button>
      </div>
    </div>
  );
}

/** After the AI review: pick the weaknesses to fix, confirm, and get a rewritten CV. */
export default function CvFix({ check, onChange }) {
  const [redo, setRedo] = useState(false);
  const status = check.fix?.status;
  if (check.aiStatus !== 'done' || !check.review) return null;

  return (
    <Card className="break-inside-avoid print:hidden">
      <h2 className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5 text-base font-semibold">
        <Wand2 className="h-4 w-4 text-violet-600" aria-hidden /> Fix gaps and weaknesses
      </h2>
      <div className="p-5">
        {status === 'pending' ? (
          <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
            <Spinner className="h-4 w-4 text-violet-600" /> Rewriting the CV… this usually takes a few seconds.
          </p>
        ) : status === 'done' && !redo ? (
          <FixResult check={check} onRedo={() => setRedo(true)} />
        ) : (
          <>
            {status === 'failed' && (
              <div className="mb-4">
                <Alert>The rewrite failed: {check.fix.error}. You can try again.</Alert>
              </div>
            )}
            {!status && <p className="mb-4 text-sm text-slate-600">Choose what to fix, confirm, and the AI rewrites the CV for you. Nothing changes until you confirm.</p>}
            <FixForm
              check={check}
              onStarted={(c) => {
                setRedo(false);
                onChange(c);
              }}
            />
          </>
        )}
      </div>
    </Card>
  );
}
