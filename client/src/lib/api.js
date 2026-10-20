'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export class ApiError extends Error {
  constructor(message, status, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const unauthorizedListeners = new Set();
export const onUnauthorized = (fn) => {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
};

/**
 * Call the API. Pass `body` for JSON or `form` (FormData) for multipart uploads.
 * Throws ApiError with server-provided field errors on failure.
 */
export async function api(path, { method = 'GET', body, form, signal } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      signal,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) unauthorizedListeners.forEach((fn) => fn());
    const fallback =
      res.status === 429 ? 'Too many requests. Please wait a moment and try again.' : res.status >= 500 ? 'Something went wrong on our side. Please try again.' : `Request failed (${res.status})`;
    throw new ApiError(data?.error || fallback, res.status, data?.fields || {});
  }
  return data;
}

/** Fetch `path` on mount and whenever it changes. Pass null to skip. */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(path);
      if (id === reqId.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (id === reqId.current) setState((s) => ({ ...s, error, loading: false }));
    }
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload: load, setData };
}

export function qs(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Fired by the CV results bell when new applications arrive, so open pages can refresh. */
export const NEW_APPLICATIONS_EVENT = 'ats:new-applications';

/** Fired after AI screening decisions are confirmed or overturned, so the sidebar badge updates. */
export const AI_SCREENING_CHANGED_EVENT = 'ats:ai-screening-changed';

export function useOnNewApplications(callback) {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    const handler = () => ref.current();
    window.addEventListener(NEW_APPLICATIONS_EVENT, handler);
    return () => window.removeEventListener(NEW_APPLICATIONS_EVENT, handler);
  }, []);
}

/**
 * Debounced search boxes update the URL a moment after typing. If the user clicks a link in
 * that moment, the late update would pull them back. Spread `onClickCapture` on the page
 * wrapper and check `leaving.current` before any delayed router.replace().
 */
export function useLeaveGuard() {
  const leaving = useRef(false);
  const onClickCapture = useCallback((e) => {
    const a = e.target.closest?.('a[href]');
    if (a && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && a.target !== '_blank') leaving.current = true;
  }, []);
  return { leaving, onClickCapture };
}

/**
 * Update URL query params without losing changes made in quick succession.
 * router.replace() commits asynchronously, so a second change made before the first lands
 * would otherwise be built from the old URL and silently drop the first one.
 */
export function useQueryUpdater() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const pending = useRef(null);
  useEffect(() => {
    pending.current = null; // URL has caught up
  }, [params]);
  return useCallback(
    (patch) => {
      const current = pending.current ?? Object.fromEntries(new URLSearchParams(window.location.search));
      const next = { ...current, ...patch };
      pending.current = next;
      router.replace(`${pathname}${qs(next)}`, { scroll: false });
    },
    [router, pathname]
  );
}
