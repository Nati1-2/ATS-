'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, BarChart3, CheckCircle2, Lightbulb, Printer, Sparkles } from 'lucide-react';
import { api, qs, useApi } from '@/lib/api';
import { formatDate, formatDateTime, STAGE_MAP } from '@/lib/constants';
import { BarList, ColumnChart } from '@/components/Charts';
import { Alert, Badge, Button, Card, cx, EmptyState, ErrorState, inputClass, LoadingState, MatchMeter, PageHeader, StageBadge, useToast } from '@/components/ui';

function Section({ title, children, className }) {
  return (
    <Card className={cx('break-inside-avoid p-5', className)}>
      <h2 className="mb-4 text-base font-semibold text-slate-900">{title}</h2>
      {children}
    </Card>
  );
}

function Kpi({ label, value, hint }) {
  return (
    <Card className="break-inside-avoid p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value ?? '—'}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

function NarrativeList({ title, items, icon: Icon, tone }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className={cx('mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide', tone)}>
        <Icon className="h-3.5 w-3.5" aria-hidden /> {title}
      </p>
      <ul className="space-y-1.5 text-sm text-slate-700">
        {items.map((x) => (
          <li key={x} className="flex gap-2">
            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportView({ report }) {
  const s = report.stats;
  const n = report.narrative;
  const notes = Object.fromEntries((n?.candidateNotes ?? []).map((c) => [c.applicationId, c.note]));
  const weekRows = s.weekly.map((w) => ({
    label: `Week of ${formatDate(w.weekStart, { month: 'short', day: 'numeric' })}`,
    short: formatDate(w.weekStart, { month: 'short', day: 'numeric' }),
    value: w.count,
  }));
  const candidateLink = (c) => `/candidates/${c.candidateId}?application=${c.applicationId}`;

  return (
    <article className="space-y-6" aria-labelledby="report-title">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="report-title" className="text-xl font-semibold text-slate-900">
            {report.title}
          </h2>
          <p className="text-sm text-slate-500">
            Generated {formatDateTime(report.createdAt)} by {report.createdBy?.name ?? 'someone'} · numbers as of that moment
          </p>
        </div>
        <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
          <Printer className="h-4 w-4" aria-hidden /> Print or save as PDF
        </Button>
      </header>

      {report.aiStatus === 'done' && n ? (
        <Card className="break-inside-avoid border-violet-200 bg-gradient-to-br from-violet-50/70 to-white p-5">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" aria-hidden />
            <Badge className="bg-violet-100 text-violet-800 ring-violet-200">AI-written summary</Badge>
          </div>
          <p className="text-lg font-semibold text-slate-900">{n.headline}</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{n.summary}</p>
          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
            <NarrativeList title="Going well" items={n.highlights} icon={CheckCircle2} tone="text-emerald-700" />
            <NarrativeList title="Watch out" items={n.risks} icon={AlertTriangle} tone="text-amber-700" />
            <NarrativeList title="Recommended next steps" items={n.recommendations} icon={Lightbulb} tone="text-blue-700" />
          </div>
          <p className="mt-4 text-xs text-slate-500">Written by {report.model} from the numbers below. AI can make mistakes: the charts and tables are the source of truth.</p>
        </Card>
      ) : (
        <Alert kind="info">
          {report.aiStatus === 'disabled'
            ? 'AI was not set up when this report was made, so it contains numbers and charts only.'
            : `The AI summary could not be written (${report.aiError || 'unknown error'}). The numbers and charts below are complete.`}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Applications" value={s.totals.applications} />
        <Kpi label="In progress" value={s.totals.active} />
        <Kpi label="Hired" value={s.totals.hired} />
        <Kpi label="Open jobs" value={s.totals.openJobs} />
        <Kpi label="Average CV match" value={s.totals.averageMatch != null ? `${s.totals.averageMatch}%` : null} />
        <Kpi label="Time to hire" value={s.totals.timeToHireDays != null ? `${s.totals.timeToHireDays} days` : null} hint={s.totals.timeToHireDays == null ? 'No hires yet' : 'average'} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Pipeline by stage">
          <BarList rows={s.stages.map((x) => ({ label: STAGE_MAP[x.stage]?.label ?? x.stage, value: x.count }))} labelHeader="Stage" valueHeader="Applications" />
        </Section>
        <Section title="Applications per week (last 8 weeks)">
          <ColumnChart rows={weekRows} labelHeader="Week" valueHeader="Applications" />
        </Section>
        <Section title="CV match distribution">
          <BarList rows={s.scoreBuckets.map((b) => ({ label: b.range, value: b.count }))} labelHeader="CV match" valueHeader="Applications" />
        </Section>
        <Section title="Automatic decisions">
          <BarList
            rows={[
              { label: 'Auto-shortlisted', value: s.decisions.advanced },
              { label: 'Needs review', value: s.decisions.review },
              { label: 'Auto-rejected', value: s.decisions.rejected },
            ]}
            labelHeader="Decision"
            valueHeader="Applications"
          />
        </Section>
      </div>

      <Section title="Top candidates still in the process">
        {s.topCandidates.length === 0 ? (
          <p className="text-sm text-slate-500">No active candidates with a CV match yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {s.topCandidates.map((c) => (
              <li key={c.applicationId} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                <span className="min-w-0 flex-1">
                  <Link href={candidateLink(c)} className="text-sm font-medium text-slate-900 hover:text-blue-700 hover:underline">
                    {c.name}
                  </Link>
                  <span className="text-sm text-slate-500"> · {c.job}</span>
                  {notes[c.applicationId] && <span className="block text-xs text-slate-600">{notes[c.applicationId]}</span>}
                </span>
                <span className="flex items-center gap-3">
                  <MatchMeter score={c.score} />
                  {c.aiFit && <Badge className="bg-violet-50 text-violet-800 ring-violet-200">AI: {c.aiFit}</Badge>}
                  <StageBadge stage={c.stage} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Waiting 7+ days in one stage">
          {s.stuck.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Nobody is waiting more than a week.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {s.stuck.map((c) => (
                <li key={c.applicationId} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <Link href={candidateLink(c)} className="font-medium text-slate-900 hover:text-blue-700 hover:underline">
                      {c.name}
                    </Link>
                    <span className="text-slate-500"> · {c.job}</span>
                  </span>
                  <StageBadge stage={c.stage} />
                  <span className="w-16 text-right text-sm font-semibold tabular-nums text-amber-700">{c.daysInStage} days</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Most common skill gaps">
          {s.skillGaps.length === 0 ? (
            <p className="text-sm text-slate-500">No missing must-have skills recorded.</p>
          ) : (
            <BarList rows={s.skillGaps.map((g) => ({ label: g.skill, value: g.missingIn }))} labelHeader="Must-have skill" valueHeader="Applicants missing it" />
          )}
          <p className="mt-3 text-xs text-slate-500">Number of applicants whose CV is missing each must-have skill.</p>
        </Section>
      </div>

      {s.upcomingInterviews.length > 0 && (
        <Section title="Upcoming interviews">
          <ul className="divide-y divide-slate-100 text-sm">
            {s.upcomingInterviews.map((i, idx) => (
              <li key={idx} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="w-44 font-medium text-indigo-700">{formatDateTime(i.when)}</span>
                <Link href={`/candidates/${i.candidateId}?tab=interviews`} className="font-medium text-slate-900 hover:underline">
                  {i.candidate}
                </Link>
                <span className="text-slate-500">
                  {i.job} · with {i.interviewer}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </article>
  );
}

function Reports() {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const jobs = useApi('/jobs');
  const list = useApi('/ai/reports');
  // Open the requested report, or the newest one
  const selectedId = params.get('id') || list.data?.reports?.[0]?._id || null;
  const selected = useApi(selectedId ? `/ai/reports/${selectedId}` : null);
  const [scope, setScope] = useState(params.get('job') || '');
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    try {
      const { report } = await api('/ai/reports', { method: 'POST', body: scope ? { jobId: scope } : {} });
      toast(report.aiStatus === 'done' ? 'Report ready' : 'Report ready (numbers only)');
      await list.reload();
      router.replace(`${pathname}${qs({ id: report._id })}`, { scroll: false });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader title="AI reports" description="Hiring numbers with an AI-written summary. The numbers always come straight from your data." />
        <Card className="mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="report-scope" className="mb-1.5 block text-sm font-medium text-slate-700">
              Report on
            </label>
            <select id="report-scope" value={scope} onChange={(e) => setScope(e.target.value)} className={inputClass()}>
              <option value="">All jobs</option>
              {jobs.data?.jobs.map((j) => (
                <option key={j._id} value={j._id}>
                  {j.title} ({j.status})
                </option>
              ))}
            </select>
          </div>
          <Button onClick={generate} loading={generating}>
            <Sparkles className="h-4 w-4" aria-hidden /> {generating ? 'Writing report…' : 'Generate report'}
          </Button>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr]">
        <aside className="print:hidden" aria-label="Past reports">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Past reports</h2>
          {list.loading && !list.data ? (
            <LoadingState />
          ) : list.data?.reports.length ? (
            <ul className="space-y-1">
              {list.data.reports.map((r) => (
                <li key={r._id}>
                  <Link
                    href={`${pathname}?id=${r._id}`}
                    scroll={false}
                    aria-current={r._id === selectedId ? 'page' : undefined}
                    className={cx('block rounded-lg px-3 py-2 text-sm', r._id === selectedId ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-100')}
                  >
                    <span className="block truncate font-medium">{r.title.replace(' — hiring report', '')}</span>
                    <span className="block text-xs text-slate-500">
                      {formatDateTime(r.createdAt)} · {r.stats?.totals?.applications ?? 0} applications
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No reports yet.</p>
          )}
        </aside>

        <div className="min-w-0">
          {!selectedId ? (
            <Card>
              <EmptyState icon={BarChart3} title="No report selected" description="Choose a scope above and generate your first hiring report." />
            </Card>
          ) : selected.loading && !selected.data ? (
            <LoadingState label="Loading report…" />
          ) : selected.error ? (
            <Card>
              <ErrorState error={selected.error} onRetry={selected.reload} />
            </Card>
          ) : selected.data ? (
            <ReportView report={selected.data.report} />
          ) : null}
        </div>
      </div>
    </>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Reports />
    </Suspense>
  );
}

