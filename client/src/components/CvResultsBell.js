'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, FileText, X } from 'lucide-react';
import { api, NEW_APPLICATIONS_EVENT } from '@/lib/api';
import { relativeTime } from '@/lib/constants';
import { DecisionBadge, MatchBadge } from './ui';

const POLL_MS = 15000;
const POPUP_MS = 12000;

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode etc. — unread count just won't persist */
  }
}

/** One-line explanation of what the screening rules did with this CV. */
function resultLine(item) {
  if (item.autoDecisionReasons?.length) return item.autoDecisionReasons[0];
  if (item.autoDecision === 'review') return 'No automatic rule applied — waiting for review';
  return 'No screening rules on this job';
}

const profileHref = (item) => `/candidates/${item.candidate?._id}?application=${item._id}`;

function ResultRow({ item, onNavigate, compact }) {
  return (
    <Link href={profileHref(item)} onClick={onNavigate} className="flex gap-3 px-4 py-3 hover:bg-slate-50">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
        <FileText className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium text-slate-900">{item.candidate?.fullName}</span>
          <MatchBadge score={item.match?.score} />
          <DecisionBadge decision={item.autoDecision} />
        </span>
        <span className="block truncate text-xs text-slate-500">
          {item.job?.title} · {relativeTime(item.createdAt)}
        </span>
        {!compact && <span className="mt-0.5 block text-xs text-slate-600">{resultLine(item)}</span>}
      </span>
    </Link>
  );
}

/** Recruiter-facing feed of screening results for newly submitted CVs, with live popups. */
export default function CvResultsBell({ userId }) {
  const seenKey = `ats:cvFeedSeen:${userId}`;
  const [items, setItems] = useState([]);
  const [popups, setPopups] = useState([]);
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(null);
  const sinceRef = useRef(null);
  const ref = useRef(null);

  const dismiss = useCallback((id) => setPopups((p) => p.filter((x) => x._id !== id)), []);

  // Initial load: fill the list; nothing pops up for CVs that arrived before this visit.
  useEffect(() => {
    let stored = storageGet(seenKey);
    if (!stored) {
      stored = new Date().toISOString();
      storageSet(seenKey, stored);
    }
    setLastSeen(stored);
    api('/applications/feed?limit=15')
      .then((d) => {
        setItems(d.items);
        sinceRef.current = d.serverTime;
      })
      .catch(() => {});
  }, [seenKey]);

  // Poll for CVs submitted since the last check and pop up their results.
  useEffect(() => {
    const tick = async () => {
      if (document.hidden || !sinceRef.current) return;
      try {
        const d = await api(`/applications/feed?since=${encodeURIComponent(sinceRef.current)}`);
        sinceRef.current = d.serverTime;
        if (!d.items.length) return;
        window.dispatchEvent(new CustomEvent(NEW_APPLICATIONS_EVENT));
        setItems((prev) => [...d.items, ...prev.filter((p) => !d.items.some((n) => n._id === p._id))].slice(0, 15));
        setPopups((prev) => [...d.items.slice(0, 3), ...prev].slice(0, 3));
        for (const it of d.items.slice(0, 3)) setTimeout(() => dismiss(it._id), POPUP_MS);
      } catch {
        /* transient network errors: try again next tick */
      }
    };
    const t = setInterval(tick, POLL_MS);
    return () => clearInterval(t);
  }, [dismiss]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const unread = lastSeen ? items.filter((i) => i.createdAt > lastSeen).length : 0;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      const now = new Date().toISOString();
      storageSet(seenKey, now);
      // Keep highlights for this open; clear the badge
      setTimeout(() => setLastSeen(now), 0);
    }
  }

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="true"
          aria-label={unread ? `CV results, ${unread} new` : 'CV results'}
          className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <Bell className="h-5 w-5" aria-hidden />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-semibold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
        {open && (
          <div className="absolute right-0 z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold">New CV results</p>
              <Link href="/candidates" onClick={() => setOpen(false)} className="text-xs font-medium text-blue-600 hover:underline">
                All candidates
              </Link>
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No applications yet.</p>
            ) : (
              <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
                {items.map((it) => (
                  <li key={it._id}>
                    <ResultRow item={it} onNavigate={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Live popups for CVs that arrive while the recruiter is working */}
      <div aria-live="polite" className="pointer-events-none fixed right-4 top-20 z-40 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {popups.map((it) => (
          <div key={it._id} role="status" className="pointer-events-auto overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between bg-blue-600 px-4 py-2 text-xs font-semibold text-white">
              New CV received
              <button type="button" onClick={() => dismiss(it._id)} aria-label="Dismiss" className="rounded p-0.5 hover:bg-white/20">
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            <ResultRow item={it} onNavigate={() => dismiss(it._id)} />
          </div>
        ))}
      </div>
    </>
  );
}

