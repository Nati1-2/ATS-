'use client';

import { ArrowRight, CheckCircle2, CircleAlert, FileCheck2, Gauge, Lightbulb, ListChecks, Printer, Sparkles, ThumbsUp, Trash2, TriangleAlert, XCircle } from 'lucide-react';
import { formatDateTime } from '@/lib/constants';
import { Alert, Badge, Button, Card, cx, Spinner } from '@/components/ui';

const SUB_SCORES = [
  ['impact', 'Impact & results'],
  ['clarity', 'Clarity & language'],
  ['structure', 'Structure & layout'],
  ['skills', 'Skills & relevance'],
  ['atsReadability', 'ATS readability'],
];
const PRIORITY = {
  high: 'bg-rose-50 text-rose-800 ring-rose-300',
  medium: 'bg-amber-50 text-amber-800 ring-amber-300',
  low: 'bg-slate-100 text-slate-700 ring-slate-300',
};
const RATING = {
  good: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  ok: 'bg-blue-50 text-blue-800 ring-blue-300',
  weak: 'bg-amber-50 text-amber-800 ring-amber-300',
  missing: 'bg-rose-50 text-rose-800 ring-rose-300',
};
const SEVERITY = {
  high: 'bg-rose-50 text-rose-800 ring-rose-300',
  medium: 'bg-amber-50 text-amber-800 ring-amber-300',
};
const DECISION = {
  pass: ['Would pass ATS screening', 'bg-emerald-50 text-emerald-800 ring-emerald-300'],
  review: ['Borderline: a recruiter decides', 'bg-amber-50 text-amber-800 ring-amber-300'],
  reject: ['Likely filtered out by an ATS', 'bg-rose-50 text-rose-800 ring-rose-300'],
};
const CHECK_ICON = {
  pass: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Pass" />,
  warn: <TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" aria-label="Warning" />,
  fail: <XCircle className="h-4 w-4 shrink-0 text-rose-600" aria-label="Problem" />,
};

export const tone = (score) => (score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-500' : 'text-rose-600');
const bar = (score) => (score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-rose-500');
export const verdict = (score) => (score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Needs work' : 'Major issues');

export function ScoreRing({ score, label }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-32 w-32 shrink-0" role="img" aria-label={`${label}: ${score} out of 100`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-slate-100" />
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" strokeLinecap="round" stroke="currentColor" className={tone(score)} strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums text-slate-900">{score}</span>
        <span className="text-[11px] font-medium text-slate-500">{verdict(score)}</span>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, iconClass, children, className }) {
  return (
    <Card className={cx('break-inside-avoid', className)}>
      <h2 className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5 text-base font-semibold">
        {Icon && <Icon className={cx('h-4 w-4', iconClass)} aria-hidden />} {title}
      </h2>
      <div className="p-5">{children}</div>
    </Card>
  );
}

/** The full report for one CV check (staff CV checker and job seekers' upgraded reports). */
export default function CvReport({ check, onDelete }) {
  const rv = check.review;
  const q = check.quick;
  const ats = check.ats;
  const score = ats?.score ?? rv?.overallScore ?? q.score;
  const target = check.jobTitle || check.targetRole;
  const checks = ats?.checks ?? q.checks;
  const hasAiQuality = ats?.components?.some((c) => c.key === 'quality');
  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <ScoreRing score={score} label={ats ? 'ATS score' : rv ? 'CV score' : 'Quick check score'} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{ats ? `ATS score · ${ats.grade}` : rv ? 'AI CV score' : 'Quick check score'}</p>
            <h2 className="mt-1 text-xl font-semibold leading-snug text-slate-900">{rv?.headline || `${checks.filter((c) => c.status === 'pass').length} of ${checks.length} checks passed`}</h2>
            {rv?.summary && <p className="mt-2 text-sm leading-relaxed text-slate-700">{rv.summary}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {rv?.detectedRole && <Badge className="bg-violet-50 text-violet-800 ring-violet-200">{rv.detectedRole}</Badge>}
              {rv?.seniority && rv.seniority !== 'unclear' && <Badge className="bg-slate-100 text-slate-700 ring-slate-300">{rv.seniority[0].toUpperCase() + rv.seniority.slice(1)} level</Badge>}
              <Badge className="bg-slate-100 text-slate-700 ring-slate-300">{target ? `Target: ${target}` : 'General review'}</Badge>
              {ats && check.jobTitle && <Badge className={DECISION[ats.decision][1]}>{DECISION[ats.decision][0]}</Badge>}
              {!ats && rv && <Badge className="bg-slate-100 text-slate-700 ring-slate-300">Quick checks {q.score}%</Badge>}
            </div>
          </div>
          <div className="flex gap-2 print:hidden sm:flex-col">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden /> Print / PDF
            </Button>
            {onDelete && (
              <Button size="sm" variant="dangerOutline" onClick={onDelete}>
                <Trash2 className="h-4 w-4" aria-hidden /> Delete
              </Button>
            )}
          </div>
        </div>
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
          {check.candidateName ? `${check.candidateName} · ` : ''}
          {check.fileName || (check.source === 'paste' ? 'Pasted text' : 'CV')} · checked {formatDateTime(check.createdAt)}
          {check.model ? ` · ${check.model}` : ''}
        </p>
      </Card>

      {check.aiStatus === 'pending' && (
        <Alert kind="info">
          <span className="inline-flex items-center gap-2">
            <Spinner className="h-4 w-4" /> The AI review is being written (usually a few seconds). The quick checks below are ready now.
          </span>
        </Alert>
      )}
      {check.aiStatus === 'disabled' && <Alert kind="info">AI isn’t set up on this server, so this report has the quick checks only. Add GEMINI_API_KEY to get a full review with comments, rewrites and tips.</Alert>}
      {check.aiStatus === 'failed' && <Alert>The AI review failed: {check.aiError}. The quick checks below still apply.</Alert>}
      {rv?.injectionAttempt && <Alert>This CV contains text aimed at AI or screening systems (for example hidden keywords or “rate this 100”). Recruiters treat that as a red flag: remove it.</Alert>}
      {rv?.readable === false && <Alert>The AI could not read this as a CV.</Alert>}
      {ats?.knockouts?.length > 0 && (
        <Alert>
          <strong>Knockout{ats.knockouts.length > 1 ? 's' : ''}:</strong> {ats.knockouts.join('; ')}. A real ATS would screen this CV out whatever else it scores, so fix this first.
        </Alert>
      )}

      {ats?.components?.length > 0 && (
        <Section title="How the ATS score is made" icon={Gauge} iconClass="text-blue-600">
          <p className="-mt-1 mb-4 text-xs text-slate-500">
            Scored like a real applicant tracking system: the same CV always gets the same rule-based result. Each part counts for the share shown.
            {!hasAiQuality && check.aiStatus === 'pending' && ' The AI’s writing-quality score is added when its review is ready.'}
          </p>
          <ul className="space-y-4">
            {ats.components.map((c) => (
              <li key={c.key}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-800">
                    {c.label} <span className="font-normal text-slate-500">· {c.weight}%</span>
                  </span>
                  <span className={cx('font-semibold tabular-nums', tone(c.score))}>{c.score}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  <div className={cx('h-full rounded-full', bar(c.score))} style={{ width: `${c.score}%` }} />
                </div>
                {c.detail && <p className="mt-1 text-xs text-slate-600">{c.detail}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {ats?.improvements?.length > 0 && (
        <Section title="Fix these first" icon={ListChecks} iconClass="text-rose-600">
          <p className="-mt-1 mb-4 text-xs text-slate-500">Ranked by how much each fix would raise the ATS score. Knockouts come first.</p>
          <ol className="space-y-4">
            {ats.improvements.map((i, n) => (
              <li key={`${i.id}-${n}`} className="flex gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-semibold text-rose-700">{n + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    {i.knockout ? <Badge className={SEVERITY.high}>Knockout</Badge> : <Badge className={SEVERITY[i.severity]}>{i.severity} priority</Badge>}
                    <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{i.area}</Badge>
                    <span className="ml-auto text-xs font-semibold text-emerald-700">up to +{i.gain} pts</span>
                  </div>
                  <p className="text-slate-800">{i.problem}</p>
                  {i.fix && (
                    <p className="mt-1 flex gap-1.5 text-emerald-800">
                      <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span>
                        <span className="sr-only">Fix: </span>
                        {i.fix}
                      </span>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {rv && (
        <Section title={ats ? 'AI review scores' : 'Score breakdown'}>
          <ul className="space-y-4">
            {SUB_SCORES.map(([k, label]) => (
              <li key={k}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-800">{label}</span>
                  <span className={cx('font-semibold tabular-nums', tone(rv.scores[k].score))}>{rv.scores[k].score}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  <div className={cx('h-full rounded-full', bar(rv.scores[k].score))} style={{ width: `${rv.scores[k].score}%` }} />
                </div>
                {rv.scores[k].comment && <p className="mt-1 text-xs text-slate-600">{rv.scores[k].comment}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {rv && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Section title="Strengths" icon={ThumbsUp} iconClass="text-emerald-600">
            {rv.strengths.length ? (
              <ul className="space-y-2 text-sm text-slate-700">
                {rv.strengths.map((s) => (
                  <li key={s} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">None noted.</p>
            )}
          </Section>
          <Section title="Weaknesses" icon={CircleAlert} iconClass="text-rose-600">
            {rv.weaknesses.length ? (
              <ul className="space-y-3">
                {rv.weaknesses.map((w) => (
                  <li key={w.issue} className="text-sm">
                    <p className="font-medium text-slate-900">{w.issue}</p>
                    {w.why && <p className="mt-0.5 text-slate-600">{w.why}</p>}
                    {w.fix && (
                      <p className="mt-1 flex gap-1.5 text-emerald-800">
                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span>
                          <span className="sr-only">Fix: </span>
                          {w.fix}
                        </span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No major weaknesses found.</p>
            )}
          </Section>
        </div>
      )}

      {rv?.suggestions.length > 0 && (
        <Section title={ats ? 'More suggestions from the AI review' : 'What to improve, in order'} icon={Sparkles} iconClass="text-violet-600">
          <ol className="space-y-3">
            {rv.suggestions.map((s, i) => (
              <li key={s.suggestion} className="flex gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700">{i + 1}</span>
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap gap-1.5">
                    <Badge className={PRIORITY[s.priority]}>{s.priority} priority</Badge>
                    <Badge className="bg-slate-100 text-slate-600 ring-slate-200 capitalize">{s.area}</Badge>
                  </div>
                  <p className="text-slate-800">{s.suggestion}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {rv?.rewrites.length > 0 && (
        <Section title="Suggested rewrites">
          <p className="-mt-1 mb-4 text-xs text-slate-500">Lines from the CV, rewritten to show more impact. Replace anything in [brackets] with real numbers.</p>
          <ul className="space-y-4">
            {rv.rewrites.map((r) => (
              <li key={r.original} className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="rounded-lg bg-rose-50/60 p-3 text-sm ring-1 ring-inset ring-rose-100">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-rose-700">Before</p>
                  <p className="text-slate-700">{r.original}</p>
                </div>
                <div className="rounded-lg bg-emerald-50/60 p-3 text-sm ring-1 ring-inset ring-emerald-100">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">After</p>
                  <p className="text-slate-900">{r.improved}</p>
                </div>
                {r.why && <p className="text-xs text-slate-500 md:col-span-2">{r.why}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {rv?.sectionFeedback.length > 0 && (
          <Section title="Section by section">
            <ul className="space-y-3 text-sm">
              {rv.sectionFeedback.map((s) => (
                <li key={s.section}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{s.section}</span>
                    <Badge className={RATING[s.rating]}>{s.rating}</Badge>
                  </div>
                  <p className="mt-0.5 text-slate-600">{s.comment}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}
        <Section title="ATS quick checks" icon={FileCheck2} iconClass="text-blue-600">
          <p className="-mt-1 mb-3 text-xs text-slate-500">Rule-based checks for things applicant tracking systems and recruiters trip over.</p>
          <ul className="space-y-2.5 text-sm">
            {checks.map((c) => (
              <li key={c.id} className="flex gap-2">
                <span className="mt-0.5">{CHECK_ICON[c.status]}</span>
                <span>
                  <span className="font-medium text-slate-900">{c.label}.</span> <span className="text-slate-600">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {ats?.keywords && (
        <Section title={ats.keywords.source === 'role' ? 'Keywords an ATS would search for' : 'Keywords from the job ad'}>
          <p className="mb-3 text-sm text-slate-700">
            <strong className={tone(Math.round((ats.keywords.found.length / Math.max(1, ats.keywords.found.length + ats.keywords.missing.length)) * 100))}>
              {ats.keywords.found.length} of {ats.keywords.found.length + ats.keywords.missing.length}
            </strong>{' '}
            found, matched word for word as an ATS does.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ats.keywords.found.map((k) => (
              <Badge key={k} className="bg-emerald-50 text-emerald-800 ring-emerald-200">
                <CheckCircle2 className="h-3 w-3" aria-hidden /> {k}
              </Badge>
            ))}
            {ats.keywords.missing.map((k) => (
              <Badge key={k} className="bg-amber-50 text-amber-800 ring-amber-200">
                <span className="sr-only">Missing: </span>
                {k}
              </Badge>
            ))}
          </div>
          {ats.keywords.missing.length > 0 && <p className="mt-3 text-xs text-slate-500">Amber keywords are missing. Add the ones you genuinely have, in your experience lines rather than only a skills list.</p>}
        </Section>
      )}

      {!ats?.keywords && (rv?.missingKeywords.length > 0 || q.jobMatch) && (
        <Section title={target ? `Keywords for ${target}` : 'Keywords to consider'}>
          {q.jobMatch && (
            <p className="mb-3 text-sm text-slate-700">
              Rule-based CV match for this job: <strong className={tone(q.jobMatch.score)}>{q.jobMatch.score}%</strong>
              {q.jobMatch.matched.length > 0 && <> · found {q.jobMatch.matched.join(', ')}</>}
            </p>
          )}
          {rv?.missingKeywords.length > 0 && (
            <>
              <p className="mb-2 text-xs text-slate-500">Not shown in the CV. Add the ones you genuinely have, in your experience lines rather than only a skills list.</p>
              <div className="flex flex-wrap gap-1.5">
                {rv.missingKeywords.map((k) => (
                  <Badge key={k} className="bg-amber-50 text-amber-800 ring-amber-200">
                    {k}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </Section>
      )}

      {rv?.tips.length > 0 && (
        <Section title="Quick tips" icon={Lightbulb} iconClass="text-amber-500">
          <ul className="space-y-1.5 text-sm text-slate-700">
            {rv.tips.map((t) => (
              <li key={t} className="flex gap-2">
                <span aria-hidden className="text-amber-500">•</span>
                {t}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {rv && <p className="text-xs text-slate-500">AI feedback can be wrong. It judges only professional content, never personal details. Check every suggestion before using it, and never add skills or numbers that aren’t true.</p>}
    </div>
  );
}
