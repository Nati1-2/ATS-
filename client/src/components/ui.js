'use client';

import Link from 'next/link';
import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Inbox, Loader2, X } from 'lucide-react';
import { STAGE_MAP, JOB_STATUS_MAP } from '@/lib/constants';

export const cx = (...c) => c.filter(Boolean).join(' ');

const BUTTON_VARIANTS = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300',
  secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300',
  dangerOutline: 'bg-white text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 disabled:text-rose-300',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-300',
};
const BUTTON_SIZES = { sm: 'h-8 px-3 text-sm gap-1.5', md: 'h-10 px-4 text-sm gap-2', icon: 'h-9 w-9 justify-center' };

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function ButtonLink({ variant = 'primary', size = 'md', className, children, ...props }) {
  return (
    <Link
      className={cx('inline-flex items-center justify-center rounded-lg font-medium transition-colors', BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    >
      {children}
    </Link>
  );
}

export const inputClass = (error) =>
  cx(
    'block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-xs',
    'focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:bg-slate-50 disabled:text-slate-500',
    error ? 'border-rose-400 focus:border-rose-500' : 'border-slate-300 focus:border-blue-500'
  );

/** Label + control + hint/error, wired up with ids for screen readers. */
export function Field({ label, error, hint, required, children, className, id: idProp }) {
  const autoId = useId();
  const id = idProp || autoId;
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
          {required && <span aria-hidden="true" className="text-rose-600"> *</span>}
        </label>
      )}
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, required })}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({ label, error, hint, required, className, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} id={props.id}>
      {(a) => <input {...a} {...props} className={inputClass(error)} />}
    </Field>
  );
}

/** Password field with a show/hide toggle and a Caps Lock warning. */
export function PasswordInput({ label = 'Password', error, hint, required, className, labelAction, ...props }) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const autoId = useId();
  const id = props.id || autoId;
  const describedBy = [hint && !error && `${id}-hint`, caps && `${id}-caps`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  const checkCaps = (e) => setCaps(Boolean(e.getModifierState?.('CapsLock')));
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {label}
          {required && <span aria-hidden="true" className="text-rose-600"> *</span>}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        <input
          {...props}
          id={id}
          type={show ? 'text' : 'password'}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onKeyDown={(e) => (checkCaps(e), props.onKeyDown?.(e))}
          onKeyUp={checkCaps}
          className={cx(inputClass(error), 'pr-10')}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 hover:text-slate-700"
        >
          {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {caps && (
        <p id={`${id}-caps`} className="mt-1 text-xs font-medium text-amber-700">
          Caps Lock is on
        </p>
      )}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextArea({ label, error, hint, required, className, rows = 4, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} id={props.id}>
      {(a) => <textarea rows={rows} {...a} {...props} className={inputClass(error)} />}
    </Field>
  );
}

export function SelectInput({ label, error, hint, required, className, options, placeholder, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} id={props.id}>
      {(a) => (
        <select {...a} {...props} className={inputClass(error)}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Badge({ className, children }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', className)}>
      {children}
    </span>
  );
}
export const StageBadge = ({ stage }) => (
  <Badge className={STAGE_MAP[stage]?.badge}>
    <span className={cx('h-1.5 w-1.5 rounded-full', STAGE_MAP[stage]?.dot)} aria-hidden />
    {STAGE_MAP[stage]?.label ?? stage}
  </Badge>
);
export const JobStatusBadge = ({ status }) => <Badge className={JOB_STATUS_MAP[status]?.badge}>{JOB_STATUS_MAP[status]?.label ?? status}</Badge>;

export function matchTone(score) {
  if (score >= 75) return 'bg-emerald-50 text-emerald-800 ring-emerald-300';
  if (score >= 50) return 'bg-amber-50 text-amber-800 ring-amber-300';
  return 'bg-rose-50 text-rose-800 ring-rose-300';
}

/** Skill-match score from CV screening; renders nothing when the job has no skills configured. */
export function MatchBadge({ score, className }) {
  if (score === undefined || score === null) return null;
  return (
    <Badge className={cx(matchTone(score), className)}>
      <span className="sr-only">CV match </span>
      {score}%
    </Badge>
  );
}

/** Compact CV match meter for tables: a short bar plus the percentage. */
export function MatchMeter({ score, srLabel = true }) {
  if (score === undefined || score === null) return null;
  const color = score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <span className="inline-flex items-center gap-2" title={`CV match ${score}%`}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-200" aria-hidden>
        <span className={cx('block h-full rounded-full', color)} style={{ width: `${score}%` }} />
      </span>
      <span className="w-9 text-xs font-semibold tabular-nums text-slate-700">
        {srLabel && <span className="sr-only">CV match </span>}
        {score}%
      </span>
    </span>
  );
}

export const DECISIONS = {
  rejected: { label: 'Auto-rejected', badge: 'bg-rose-50 text-rose-800 ring-rose-300' },
  advanced: { label: 'Auto-shortlisted', badge: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
  review: { label: 'Needs review', badge: 'bg-amber-50 text-amber-800 ring-amber-300' },
};

/** What the automatic screening rules decided when the candidate applied. */
export function DecisionBadge({ decision }) {
  const d = DECISIONS[decision];
  return d ? <Badge className={d.badge}>{d.label}</Badge> : null;
}

export function ScreeningFailedBadge() {
  return <Badge className="bg-rose-50 text-rose-800 ring-rose-300">Failed screening</Badge>;
}

/**
 * Accessible tabs (WAI-ARIA tabs pattern): arrow keys move between tabs.
 * tabs: [{ id, label, count? }]
 */
export function Tabs({ tabs, value, onChange, label }) {
  const refs = useRef({});
  function onKeyDown(e) {
    const i = tabs.findIndex((t) => t.id === value);
    const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[tabs[next].id]?.focus();
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => (refs.current[t.id] = el)}
            role="tab"
            type="button"
            id={`tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cx(
              '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              selected ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span className={cx('rounded-full px-1.5 text-[11px] font-semibold', selected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600')}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, active, children }) {
  if (!active) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} className="space-y-6 pt-6">
      {children}
    </div>
  );
}

export function Card({ className, children, ...props }) {
  return (
    <div className={cx('rounded-xl border border-slate-200 bg-white shadow-xs', className)} {...props}>
      {children}
    </div>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={cx('h-5 w-5 animate-spin text-blue-600', className)} aria-hidden />;
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 rounded-full bg-blue-50 p-3 text-blue-600">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 rounded-full bg-rose-50 p-3 text-rose-600">
        <AlertCircle className="h-6 w-6" aria-hidden />
      </div>
      <h3 className="text-sm font-semibold text-slate-900">
        {error?.status === 403 ? 'Access denied' : error?.status === 404 ? 'Not found' : 'Something went wrong'}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{error?.message}</p>
      {onRetry && error?.status !== 403 && error?.status !== 404 && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Alert({ kind = 'error', children }) {
  const styles = {
    error: 'bg-rose-50 text-rose-800 ring-rose-200',
    success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    info: 'bg-blue-50 text-blue-800 ring-blue-200',
    warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  };
  const Icon = kind === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={cx('flex gap-2 rounded-lg p-3 text-sm ring-1 ring-inset', styles[kind])}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Accessible modal built on <dialog>: focus trapping and Escape handling come from the browser. */
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        'm-auto w-[calc(100%-2rem)] rounded-xl bg-white p-0 shadow-xl backdrop:bg-slate-900/40',
        size === 'lg' ? 'max-w-2xl' : 'max-w-md'
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, loading, onConfirm, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{message}</p>
    </Modal>
  );
}

// ---- Toasts ----
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, kind = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 print:hidden">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto flex max-w-sm items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg',
              t.kind === 'error' ? 'bg-rose-600' : 'bg-slate-900'
            )}
          >
            {t.kind === 'error' ? <AlertCircle className="h-4 w-4" aria-hidden /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function Avatar({ name, className }) {
  const initials = (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
  return (
    <span aria-hidden className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700', className || 'h-9 w-9 text-sm')}>
      {initials}
    </span>
  );
}
