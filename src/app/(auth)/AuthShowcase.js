import { CheckCircle2, KanbanSquare, Sparkles } from 'lucide-react';

const FEATURES = [
  { icon: KanbanSquare, title: 'One pipeline for every role', text: 'See every candidate, stage and interview in one place.' },
  { icon: CheckCircle2, title: 'CV screening built in', text: 'Match scores, knockout questions and clear reasons for every decision.' },
  { icon: Sparkles, title: 'An assistant that knows your data', text: 'Ask questions and get reports, always with a person in charge.' },
];

const COLUMNS = [
  { name: 'Applied', people: [['LK', 72], ['MA', 54], ['DT', 38]] },
  { name: 'Screening', people: [['SG', 91], ['HB', 85]] },
  { name: 'Interview', people: [['YB', 95]] },
];

/** Product panel beside the sign-in form (large screens only). Purely decorative preview. */
export default function AuthShowcase() {
  return (
    <aside aria-hidden className="relative hidden overflow-hidden bg-slate-950 lg:flex lg:flex-col lg:justify-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(59,130,246,0.18),transparent_55%)]" />
      <div className="relative mx-auto w-full max-w-lg px-12 py-16">
        <p className="text-sm font-medium text-blue-300">Applicant tracking</p>
        <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-white">Hire with less busywork.</h2>
        <ul className="mt-8 space-y-5">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-blue-300">
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">{title}</span>
                <span className="block text-sm leading-relaxed text-slate-400">{text}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-12 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur">
          <div className="grid grid-cols-3 gap-3">
            {COLUMNS.map((col) => (
              <div key={col.name} className="rounded-xl bg-white/5 p-2.5">
                <p className="mb-2 flex items-center justify-between text-[11px] font-medium text-slate-300">
                  {col.name} <span className="rounded-full bg-white/10 px-1.5 text-[10px]">{col.people.length}</span>
                </p>
                <div className="space-y-2">
                  {col.people.map(([initials, score]) => (
                    <div key={initials} className="rounded-lg bg-slate-900/80 p-2 ring-1 ring-white/10">
                      <div className="flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20 text-[9px] font-semibold text-blue-200">{initials}</span>
                        <span className="h-1.5 flex-1 rounded-full bg-white/10" />
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                          <span className={`block h-full rounded-full ${score >= 75 ? 'bg-emerald-400' : score >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${score}%` }} />
                        </span>
                        <span className="text-[9px] tabular-nums text-slate-400">{score}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
