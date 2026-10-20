'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Maximize2, RotateCcw, Sparkles, X } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { useAssistant } from './assistant/useAssistant';
import { ChatComposer, ChatThread } from './assistant/Chat';
import { Button, cx } from './ui';

/** Floating "Ask AI" panel available on every internal page (except the full assistant page). */
export default function AssistantChat() {
  const pathname = usePathname();
  const { user } = useAuth();
  const chat = useAssistant();
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (pathname.startsWith('/assistant')) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="assistant-panel"
        className={cx(
          'fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:shadow-xl print:hidden',
          open && 'pointer-events-none opacity-0'
        )}
      >
        <Sparkles className="h-4 w-4" aria-hidden /> Ask AI
      </button>

      {open && (
        <div className="fixed inset-0 z-40 sm:inset-auto sm:bottom-5 sm:right-5" role="dialog" aria-modal="false" aria-labelledby="assistant-title" id="assistant-panel">
          <div className="flex h-full flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-slate-200 sm:h-[min(640px,calc(100vh-2.5rem))] sm:w-[400px] sm:rounded-2xl">
            <div className="flex items-center gap-1 border-b border-slate-200 bg-gradient-to-r from-violet-50 to-blue-50 py-2.5 pl-4 pr-2">
              <Sparkles className="mr-1 h-4 w-4 text-violet-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <h2 id="assistant-title" className="text-sm font-semibold text-slate-900">
                  AI assistant
                </h2>
                <p className="truncate text-xs text-slate-500">Answers from your live hiring data · read-only</p>
              </div>
              {chat.messages.length > 0 && (
                <Button size="icon" variant="ghost" onClick={chat.reset} aria-label="Start a new conversation" title="New conversation">
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
              <Link href="/assistant" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-white/70 hover:text-slate-900" aria-label="Open full screen" title="Open full screen">
                <Maximize2 className="h-4 w-4" aria-hidden />
              </Link>
              <Button size="icon" variant="ghost" onClick={() => setOpen(false)} aria-label="Close assistant">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <ChatThread chat={chat} userName={user?.name} onNavigate={() => window.innerWidth < 640 && setOpen(false)} />
            </div>
            <div className="border-t border-slate-200 p-3">
              <ChatComposer chat={chat} inputRef={inputRef} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
