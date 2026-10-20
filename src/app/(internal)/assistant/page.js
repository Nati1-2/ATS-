'use client';

import { RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useAssistant, SUGGESTIONS } from '@/components/assistant/useAssistant';
import { ChatComposer, ChatThread } from '@/components/assistant/Chat';
import { Badge, Button } from '@/components/ui';

/** Full-page AI assistant (same conversation as the floating "Ask AI" panel). */
export default function AssistantPage() {
  const { user } = useAuth();
  const chat = useAssistant();
  return (
    <div className="-my-6 flex h-[calc(100vh-4rem)] flex-col lg:-my-8">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 py-4">
        <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 text-white">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-slate-900">AI assistant</h1>
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> Read-only: looks up your hiring data, never changes it
            {chat.model && <Badge className="ml-1 bg-slate-100 text-slate-600 ring-slate-200">{chat.model}</Badge>}
          </p>
        </div>
        {chat.messages.length > 0 && (
          <Button variant="secondary" size="sm" onClick={chat.reset}>
            <RotateCcw className="h-4 w-4" aria-hidden /> New conversation
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-6">
        <ChatThread chat={chat} userName={user?.name} suggestions={SUGGESTIONS} roomy />
      </div>
      <div className="mx-auto w-full max-w-3xl pb-5">
        <ChatComposer chat={chat} autoFocus />
      </div>
    </div>
  );
}
