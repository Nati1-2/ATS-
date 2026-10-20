'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, useApi } from '@/lib/api';

const STORE_KEY = 'ats:assistant';
const EVENT = 'ats:assistant-changed';

function load() {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY)) ?? [];
  } catch {
    return [];
  }
}
function save(messages) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-30)));
  } catch {
    /* private mode: the chat just won't survive a reload */
  }
  window.dispatchEvent(new Event(EVENT));
}

export const SUGGESTIONS = [
  'Who are the best candidates right now?',
  'Who has been waiting longest for a decision?',
  'Summarize hiring for each open job',
  'Which must-have skills are applicants missing most?',
  'What interviews are coming up this week?',
  'How is the Senior Frontend Engineer role going?',
];

/**
 * One conversation shared by the floating panel and the full assistant page
 * (kept in sessionStorage, so it survives navigation within the tab).
 */
export function useAssistant() {
  const status = useApi('/ai/status');
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setMessages(load());
    const sync = () => setMessages(load());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  // sessionStorage is the single source of truth, updated synchronously (the panel and page share it)
  const update = useCallback((fn) => {
    const next = fn(load());
    save(next);
    setMessages(next);
  }, []);

  const send = useCallback(
    async (text) => {
      const content = text.trim();
      if (!content || busy) return;
      let history;
      update((m) => (history = [...m, { role: 'user', content }]));
      setError('');
      setBusy(true);
      try {
        const res = await api('/ai/chat', { method: 'POST', body: { messages: history.map(({ role, content: c }) => ({ role, content: c })) } });
        update((m) => [...m, { role: 'assistant', content: res.reply }]);
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    },
    [busy, update]
  );

  const retry = useCallback(() => {
    const all = load();
    const last = all.at(-1);
    if (last?.role !== 'user') return;
    update((m) => (m.at(-1)?.role === 'user' ? m.slice(0, -1) : m)); // drop the unanswered question, then ask again
    send(last.content);
  }, [send, update]);

  const reset = useCallback(() => {
    update(() => []);
    setError('');
  }, [update]);

  return { enabled: status.data?.enabled, model: status.data?.model, statusLoading: status.loading, messages, busy, error, send, retry, reset };
}
