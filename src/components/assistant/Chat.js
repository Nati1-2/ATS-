'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';
import SafeMarkdown from '../SafeMarkdown';
import { Avatar, Button, cx, Spinner } from '../ui';
import { SUGGESTIONS } from './useAssistant';

/** The message list: empty state with suggestions, the conversation, progress and errors. */
export function ChatThread({ chat, userName, onNavigate, suggestions = SUGGESTIONS.slice(0, 4), roomy = false }) {
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.messages.length, chat.busy, chat.error]);

  if (chat.statusLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (!chat.enabled) {
    return (
      <p className="rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
        The AI assistant isn’t set up on this server. An admin can turn it on by adding a Gemini API key (<code className="rounded bg-slate-200 px-1">GEMINI_API_KEY</code>) to the server settings.
      </p>
    );
  }

  return (
    <div className={cx('space-y-5', roomy && 'mx-auto max-w-3xl')} aria-live="polite">
      {chat.messages.length === 0 && (
        <div className={cx(roomy && 'py-6 text-center')}>
          {roomy && (
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 text-white shadow-sm">
              <Sparkles className="h-6 w-6" aria-hidden />
            </span>
          )}
          <p className={cx('text-slate-600', roomy ? 'text-base' : 'text-sm')}>
            {roomy ? 'Ask about your jobs, candidates and hiring progress.' : 'Ask about your jobs, candidates and hiring progress. I can look things up but can’t change anything.'}
          </p>
          <div className={cx('mt-5 grid gap-2', roomy ? 'text-left sm:grid-cols-2' : 'grid-cols-1')}>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => chat.send(s)}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-sm text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {chat.messages.map((m, i) =>
        m.role === 'user' ? (
          <div key={i} className="flex justify-end gap-2.5">
            <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-blue-600 px-3.5 py-2 text-sm text-white">{m.content}</p>
            {roomy && <Avatar name={userName} className="h-8 w-8 text-xs" />}
          </div>
        ) : (
          <div key={i} className="flex gap-2.5">
            {roomy && (
              <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-600 text-white">
                <Sparkles className="h-4 w-4" />
              </span>
            )}
            <div className={cx('min-w-0 rounded-2xl rounded-bl-md px-3.5 py-2.5 text-slate-800', roomy ? 'flex-1 border border-slate-200 bg-white' : 'max-w-[95%] bg-slate-100')}>
              <SafeMarkdown text={m.content} onNavigate={onNavigate} />
            </div>
          </div>
        )
      )}

      {chat.busy && (
        <div role="status" className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner className="h-4 w-4 text-violet-600" /> Looking up your hiring data…
        </div>
      )}
      {chat.error && (
        <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
          {chat.error}{' '}
          <button type="button" className="font-medium underline" onClick={chat.retry}>
            Try again
          </button>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

/** Text box with Enter-to-send (Shift+Enter for a new line). */
export function ChatComposer({ chat, inputRef, autoFocus }) {
  const [input, setInput] = useState('');
  if (!chat.enabled) return null;
  const submit = () => {
    if (!input.trim() || chat.busy) return;
    chat.send(input);
    setInput('');
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-1.5 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30">
        <label htmlFor="assistant-input" className="sr-only">
          Ask the hiring assistant
        </label>
        <textarea
          id="assistant-input"
          ref={inputRef}
          autoFocus={autoFocus}
          rows={1}
          value={input}
          maxLength={2000}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask about candidates, jobs, numbers…"
          className="max-h-40 min-h-[38px] flex-1 resize-none bg-transparent px-2 py-2 text-sm focus:outline-none"
        />
        <Button type="submit" size="icon" disabled={!input.trim() || chat.busy} aria-label="Send" className="rounded-lg">
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-1.5 text-center text-[11px] text-slate-400">Read-only · AI can make mistakes, so check important details on the candidate’s profile.</p>
    </form>
  );
}
