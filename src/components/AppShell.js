'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BarChart3, Briefcase, ChevronsUpDown, CreditCard, FileCheck2, Globe, Sparkles, ExternalLink, KanbanSquare, LayoutDashboard, LogOut, Menu, Search, Settings, ShieldCheck, Users, X } from 'lucide-react';
import { useAuth } from './AuthProvider';
import CvResultsBell from './CvResultsBell';
import CommandPalette from './CommandPalette';
import AssistantChat from './AssistantChat';
import { Avatar, cx, LoadingState } from './ui';
import { api, useApi, useOnNewApplications, AI_SCREENING_CHANGED_EVENT, PAYMENTS_CHANGED_EVENT } from '@/lib/api';
import { roleLabel } from '@/lib/constants';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/candidates', label: 'Candidates', icon: Users },
  { href: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
];

const AI_NAV = [
  { href: '/ai-screening', label: 'AI screening', icon: ShieldCheck, countKey: 'aiPending' },
  { href: '/cv-checker', label: 'CV checker', icon: FileCheck2 },
  { href: '/assistant', label: 'AI assistant', icon: Sparkles },
  { href: '/reports', label: 'AI reports', icon: BarChart3 },
];

function Brand({ company }) {
  return (
    <div className="flex h-16 items-center gap-2.5 px-5">
      {company?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={company.logoUrl} alt="" className="h-8 w-8 rounded-lg object-contain" />
      ) : (
        <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-bold text-white shadow-sm">
          {(company?.name || 'A')[0]}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold leading-tight text-slate-900">{company?.name ?? ' '}</span>
        <span className="block text-xs leading-tight text-slate-500">Hiring</span>
      </span>
    </div>
  );
}

function NavLink({ href, label, icon: Icon, onNavigate, external, ai, count, countLabel = 'AI decisions waiting for you' }) {
  const pathname = usePathname();
  const active = !external && (pathname === href || pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      onClick={onNavigate}
      target={external ? '_blank' : undefined}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      )}
    >
      {active && <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-blue-600" />}
      <Icon className={cx('h-4 w-4', active ? 'text-blue-600' : ai ? 'text-violet-500' : 'text-slate-400 group-hover:text-slate-600')} aria-hidden />
      {label}
      {count > 0 && (
        <span className="ml-auto rounded-full bg-violet-600 px-1.5 py-px text-[10px] font-semibold tabular-nums text-white" title={`${count} ${countLabel}`}>
          {count > 99 ? '99+' : count}
          <span className="sr-only"> waiting for review</span>
        </span>
      )}
      {external && (
        <>
          <ExternalLink className="ml-auto h-3.5 w-3.5 text-slate-300" aria-hidden />
          <span className="sr-only">(opens in new tab)</span>
        </>
      )}
    </Link>
  );
}

function UserCard() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
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
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account: ${user.name}`}
        className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-slate-100"
      >
        <Avatar name={user.name} className="h-8 w-8 text-xs" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-tight text-slate-900">{user.name}</span>
          <span className="block truncate text-xs leading-tight text-slate-500">{roleLabel(user.role)}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 text-slate-400" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute bottom-full left-0 right-0 z-30 mb-2 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <p className="truncate border-b border-slate-100 px-3 py-2 text-xs text-slate-500">{user.email}</p>
          <button role="menuitem" type="button" onClick={logout} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Sidebar({ company, onNavigate, counts = {} }) {
  const { user } = useAuth();
  return (
    <nav aria-label="Main" className="flex h-full flex-col">
      <Brand company={company} />
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <p className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Hiring</p>
        <ul className="space-y-0.5">
          {NAV.map((n) => (
            <li key={n.href}>
              <NavLink {...n} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-1.5 px-3 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          AI <span className="rounded bg-violet-100 px-1 py-px text-[9px] font-bold text-violet-700">NEW</span>
        </p>
        <ul className="space-y-0.5">
          {AI_NAV.map((n) => (
            <li key={n.href}>
              <NavLink {...n} onNavigate={onNavigate} ai count={counts[n.countKey]} />
            </li>
          ))}
        </ul>
        <p className="px-3 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Workspace</p>
        <ul className="space-y-0.5">
          {user?.role === 'admin' && (
            <li>
              <NavLink href="/payments" label="Payments" icon={CreditCard} onNavigate={onNavigate} count={counts.paymentsPending} countLabel="payments waiting for approval" />
            </li>
          )}
          <li>
            <NavLink href="/settings" label="Settings" icon={Settings} onNavigate={onNavigate} />
          </li>
          <li>
            <NavLink href="/careers" label="Careers site" icon={Globe} external />
          </li>
        </ul>
      </div>
      <div className="border-t border-slate-200 p-3">
        <UserCard />
      </div>
    </nav>
  );
}

/** AI decisions waiting for a recruiter, for the sidebar badge. Refreshes on new CVs, reviews and every minute. */
function useAiPendingCount(enabled) {
  const [count, setCount] = useState(0);
  const load = useRef(() => {});
  load.current = async () => {
    if (!enabled || document.hidden) return;
    try {
      setCount((await api('/ai-screening/summary')).pending);
    } catch {
      /* badge is optional */
    }
  };
  useEffect(() => {
    if (!enabled) return;
    load.current();
    const t = setInterval(() => load.current(), 60_000);
    const onChange = () => load.current();
    window.addEventListener(AI_SCREENING_CHANGED_EVENT, onChange);
    return () => {
      clearInterval(t);
      window.removeEventListener(AI_SCREENING_CHANGED_EVENT, onChange);
    };
  }, [enabled]);
  useOnNewApplications(() => load.current());
  return count;
}

/** Job seekers' payments waiting for an admin, for the sidebar badge. */
function usePaymentsPendingCount(enabled) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const load = async () => {
      if (document.hidden) return;
      try {
        setCount((await api('/payments?status=pending')).pending);
      } catch {
        /* badge is optional */
      }
    };
    load();
    const t = setInterval(load, 60_000);
    window.addEventListener(PAYMENTS_CHANGED_EVENT, load);
    return () => {
      clearInterval(t);
      window.removeEventListener(PAYMENTS_CHANGED_EVENT, load);
    };
  }, [enabled]);
  return count;
}

export default function AppShell({ children }) {
  const { user, loading } = useAuth();
  const company = useApi('/public/company').data?.company;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setMobileOpen(false), [pathname]);
  const aiPending = useAiPendingCount(Boolean(user));
  const paymentsPending = usePaymentsPendingCount(user?.role === 'admin');
  const counts = { aiPending, paymentsPending };

  // Ctrl/⌘ + K opens search from anywhere
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Loading your workspace…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only z-50 rounded bg-blue-600 px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-2 focus:top-2">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white lg:block print:hidden">
        <Sidebar company={company} counts={counts} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-72 max-w-[85vw] bg-white shadow-xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
            <Sidebar company={company} counts={counts} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64 print:pl-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/85 px-4 backdrop-blur sm:px-6 lg:px-8 print:hidden">
          <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 hover:border-slate-300 hover:bg-white sm:max-w-sm"
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">Search candidates and jobs…</span>
            <kbd className="ml-auto hidden rounded border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-slate-500 sm:block">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <CvResultsBell userId={user.id} />
          </div>
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <AssistantChat />
    </div>
  );
}
