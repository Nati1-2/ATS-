'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, CornerDownLeft, Search, User } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { cx, Spinner, StageBadge, JobStatusBadge } from './ui';

/** Search candidates and jobs from anywhere (Ctrl/⌘ + K). */
export default function CommandPalette({ open, onClose }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState({ jobs: [], people: [] });
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setQ('');
      setResults({ jobs: [], people: [] });
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults({ jobs: [], people: [] });
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const [j, c] = await Promise.all([
          api(`/jobs${qs({ q: term })}`, { signal: ctrl.signal }),
          api(`/candidates${qs({ q: term, limit: 6 })}`, { signal: ctrl.signal }),
        ]);
        // One row per person (their most recent application)
        const seen = new Set();
        const people = c.applications.filter((a) => !seen.has(a.candidate._id) && seen.add(a.candidate._id));
        setResults({ jobs: j.jobs.slice(0, 5), people });
        setActive(0);
      } catch (err) {
        if (err.name !== 'AbortError') setResults({ jobs: [], people: [] });
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const items = [
    ...results.people.map((a) => ({ key: `p-${a._id}`, href: `/candidates/${a.candidate._id}?application=${a._id}`, kind: 'person', a })),
    ...results.jobs.map((j) => ({ key: `j-${j._id}`, href: `/jobs/${j._id}`, kind: 'job', j })),
  ];

  const go = useCallback(
    (item) => {
      onClose();
      router.push(item.href);
    },
    [onClose, router]
  );

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault();
      go(items[active]);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="Search"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl rounded-xl bg-white p-0 shadow-2xl backdrop:bg-slate-900/40"
    >
      {open && (
        <>
      <div className="flex items-center gap-3 border-b border-slate-200 px-4">
        <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search candidates and jobs…"
          aria-label="Search candidates and jobs"
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls="palette-results"
          aria-activedescendant={items[active] ? `pal-${items[active].key}` : undefined}
          className="h-14 flex-1 bg-transparent text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
        {loading && <Spinner className="h-4 w-4" />}
        <kbd className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 sm:block">Esc</kbd>
      </div>
      <div id="palette-results" role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-2">
        {q.trim().length < 2 ? (
          <p className="px-3 py-6 text-center text-sm text-slate-500">Type a name, email or job title</p>
        ) : !loading && items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-slate-500">No matches for “{q.trim()}”</p>
        ) : (
          ['person', 'job'].map((kind) => {
            const group = items.filter((i) => i.kind === kind);
            if (!group.length) return null;
            return (
              <div key={kind} role="group" aria-label={kind === 'person' ? 'Candidates' : 'Jobs'} className="mb-1">
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{kind === 'person' ? 'Candidates' : 'Jobs'}</p>
                {group.map((item) => {
                  const idx = items.indexOf(item);
                  return (
                    <div
                      key={item.key}
                      id={`pal-${item.key}`}
                      role="option"
                      aria-selected={idx === active}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(item)}
                      className={cx('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2', idx === active ? 'bg-blue-50' : 'hover:bg-slate-50')}
                    >
                      {kind === 'person' ? <User className="h-4 w-4 text-slate-400" aria-hidden /> : <Briefcase className="h-4 w-4 text-slate-400" aria-hidden />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{kind === 'person' ? item.a.candidate.fullName : item.j.title}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {kind === 'person' ? `${item.a.candidate.email} · ${item.a.job.title}` : `${item.j.department} · ${item.j.location}`}
                        </span>
                      </span>
                      {kind === 'person' ? <StageBadge stage={item.a.stage} /> : <JobStatusBadge status={item.j.status} />}
                      {idx === active && <CornerDownLeft className="hidden h-3.5 w-3.5 text-slate-400 sm:block" aria-hidden />}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
        </>
      )}
    </dialog>
  );
}
