'use client';

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Button, cx, inputClass } from './ui';

/** Tag-style input: type a skill and press Enter or comma. Use "|" for aliases, e.g. "React | React.js". */
export function SkillInput({ id, label, hint, value, onChange, tone = 'blue' }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft.split(',').map((s) => s.trim()).filter(Boolean);
    const next = [...value];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setDraft('');
  };
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-300 bg-white p-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/40">
        {value.map((skill) => (
          <span
            key={skill}
            className={cx(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
              tone === 'blue' ? 'bg-blue-50 text-blue-800' : 'bg-slate-100 text-slate-700'
            )}
          >
            {skill}
            <button type="button" onClick={() => onChange(value.filter((v) => v !== skill))} aria-label={`Remove ${skill}`} className="rounded hover:bg-black/10">
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => draft.trim() && add()}
          placeholder={value.length ? '' : 'Type a skill and press Enter'}
          className="min-w-[10rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm focus:outline-none"
        />
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const TYPES = [
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'number', label: 'Number' },
  { value: 'text', label: 'Short text' },
];

export const TEMPLATES = [
  { question: 'Are you legally authorized to work in this location?', type: 'yes_no', required: true, knockout: true, expectedAnswer: 'yes' },
  { question: 'How many years of professional experience do you have?', type: 'number', required: true, knockout: true, minValue: 3 },
  { question: 'Will you now or in the future require visa sponsorship?', type: 'yes_no', required: true, knockout: true, expectedAnswer: 'no' },
  { question: 'Are you willing to work on-site / relocate?', type: 'yes_no', required: true, knockout: false, expectedAnswer: 'yes' },
  { question: 'What is your notice period?', type: 'text', required: false, knockout: false },
];

/** Build the job's screening questions, with optional knockout rules. */
export function QuestionsEditor({ value, onChange, errors = {} }) {
  const update = (i, patch) => onChange(value.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const unused = TEMPLATES.filter((t) => !value.some((q) => q.question === t.question));
  return (
    <div className="space-y-3">
      {value.length === 0 && <p className="text-sm text-slate-500">No screening questions. Add one below or start from a common template.</p>}
      {value.map((q, i) => (
        <fieldset key={q._id || `new-${i}`} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <legend className="sr-only">Question {i + 1}</legend>
          <div className="flex gap-2">
            <div className="flex-1">
              <label htmlFor={`q-${i}`} className="sr-only">
                Question {i + 1} text
              </label>
              <input
                id={`q-${i}`}
                value={q.question}
                onChange={(e) => update(i, { question: e.target.value })}
                placeholder="Question for applicants"
                className={inputClass(errors[`screeningQuestions.${i}.question`])}
              />
              {errors[`screeningQuestions.${i}.question`] && <p className="mt-1 text-xs font-medium text-rose-600">{errors[`screeningQuestions.${i}.question`]}</p>}
            </div>
            <Button variant="ghost" size="icon" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Delete question ${i + 1}`}>
              <Trash2 className="h-4 w-4 text-rose-600" />
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-slate-600">Answer type</span>
              <select value={q.type} onChange={(e) => update(i, { type: e.target.value, knockout: e.target.value === 'text' ? false : q.knockout })} className="rounded-md border border-slate-300 bg-white px-2 py-1">
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={q.required} onChange={(e) => update(i, { required: e.target.checked })} />
              Required
            </label>
            {q.type !== 'text' && (
              <label className="flex items-center gap-1.5">
                <input type="checkbox" className="h-4 w-4 accent-rose-600" checked={q.knockout} onChange={(e) => update(i, { knockout: e.target.checked })} />
                Knockout
              </label>
            )}
            {q.knockout && q.type === 'yes_no' && (
              <label className="flex items-center gap-2">
                <span className="text-slate-600">Must answer</span>
                <select value={q.expectedAnswer || 'yes'} onChange={(e) => update(i, { expectedAnswer: e.target.value })} className="rounded-md border border-slate-300 bg-white px-2 py-1">
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            )}
            {q.knockout && q.type === 'number' && (
              <label className="flex items-center gap-2">
                <span className="text-slate-600">Minimum</span>
                <input type="number" min="0" value={q.minValue ?? ''} onChange={(e) => update(i, { minValue: e.target.value })} className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1" />
              </label>
            )}
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => onChange([...value, { question: '', type: 'yes_no', required: true, knockout: false, expectedAnswer: 'yes' }])} disabled={value.length >= 10}>
          <Plus className="h-4 w-4" aria-hidden /> Add question
        </Button>
        {unused.slice(0, 3).map((t) => (
          <Button key={t.question} size="sm" variant="ghost" onClick={() => onChange([...value, { ...t }])} disabled={value.length >= 10}>
            + {t.question.length > 38 ? `${t.question.slice(0, 36)}…` : t.question}
          </Button>
        ))}
      </div>
    </div>
  );
}
