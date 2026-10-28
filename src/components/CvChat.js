'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, MessageCircle, RotateCcw, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import SafeMarkdown from '@/components/SafeMarkdown';
import { Button, Card, Spinner } from '@/components/ui';

function suggestionsFor(check) {
  const top = check.ats?.improvements?.[0];
  const target = check.jobTitle || check.targetRole;
  return [
    `Why is my score ${check.ats?.score ?? check.review?.overallScore ?? check.quick?.score}, and what would raise it most?`,
    top ? 'Show me exactly how to fix the first item in “Fix these first”.' : 'What is the single most important thing to change?',
    target ? `Rewrite my summary for a ${target} role.` : 'Rewrite my professional summary.',
    'Rewrite my three weakest bullet points to show results.',
  ];
}

/** Follow-up questions about a CV report. `endpoint` is the check's chat URL (staff or seeker). Render with key={check._id}. */
export default function CvChat({ check, endpoint }) {
  const [messages, setMessages] = useState(check.chat || []);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lastQuestion, setLastQuestion] = useState('');
  const endRef = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    if (!started.current) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, busy, error]);

  async function send(text) {
    const message = text.trim();
    if (!message || busy) return;
    started.current = true;
    setError(null);
    setLastQuestion(message);
    setMessages((m) => [...m, { role: 'user', content: message }]);
    setInput('');
    setBusy(true);
    try {
      const { chat } = await api(endpoint, { method: 'POST', body: { message } });
      setMessages(chat);
    } catch (err) {
      setMessages((m) => m.slice(0, -1));
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    try {
      await api(endpoint, { method: 'DELETE' });
      setMessages([]);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  if (check.aiStatus === 'disabled') return null;
  if (check.aiStatus === 'pending') {
    return (
      <Card className="flex items-center gap-2 p-5 text-sm text-slate-600 print:hidden">
        <MessageCircle className="h-4 w-4 text-violet-600" aria-hidden /> You can ask questions about this report once the AI review is ready.
      </Card>
    );
  }

  return (
    <Card className="print:hidden">
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5">
        <MessageCircle className="h-4 w-4 text-violet-600" aria-hidden />
        <h2 className="flex-1 text-base font-semibold">Ask about this report</h2>
        {messages.length > 0 && (
          <Button size="sm" variant="ghost" onClick={reset} disabled={busy}>
            <RotateCcw className="h-4 w-4" aria-hidden /> New chat
          </Button>
        )}
      </div>
      <div className="space-y-4 p-5" aria-live="polite">
        {messages.length === 0 && (
          <div>
            <p className="text-sm text-slate-600">Ask why something scored as it did, how to fix it, or for a rewrite of any part of the CV.</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {suggestionsFor(check).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  disabled={busy}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-sm text-slate-700 transition-colors hover:border-violet-300 hover:bg-violet-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-violet-600 px-3.5 py-2 text-sm text-white">{m.content}</p>
            </div>
          ) : (
            <div key={i} className="flex gap-2.5">
              <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-600 text-white">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 max-w-[90%] rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2.5 text-slate-800">
                <SafeMarkdown text={m.content} />
              </div>
            </div>
          )
        )}

        {busy && (
          <div role="status" className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner className="h-4 w-4 text-violet-600" /> Thinking about your CV…
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
            {error}{' '}
            {lastQuestion && (
              <button type="button" className="font-medium underline" onClick={() => send(lastQuestion)}>
                Try again
              </button>
            )}
          </div>
        )}
        <div ref={endRef} />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-1.5 shadow-sm focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/30">
            <label htmlFor="cv-chat-input" className="sr-only">
              Ask about this CV report
            </label>
            <textarea
              id="cv-chat-input"
              rows={1}
              value={input}
              maxLength={2000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="e.g. How do I show more impact in my last job?"
              className="max-h-40 min-h-[38px] flex-1 resize-none bg-transparent px-2 py-2 text-sm focus:outline-none"
            />
            <Button type="submit" size="icon" disabled={!input.trim() || busy} aria-label="Send" className="rounded-lg">
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-slate-400">AI can make mistakes. Never add skills or numbers to your CV that aren’t true.</p>
        </form>
      </div>
    </Card>
  );
}
