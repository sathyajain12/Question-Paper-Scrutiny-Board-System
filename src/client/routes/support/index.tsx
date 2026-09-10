/**
 * Support desk — the administrator's side of the HoD help widget.
 *
 * A HoD who cannot find their answer in the FAQ opens a thread; every thread
 * lands here. The list is the inbox, the pane is the conversation. Presence
 * is not shown as a status the admin sets: simply having the portal open is
 * what makes them available, which is the promise the widget's offline panel
 * falls back from.
 */
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Inbox, Send } from 'lucide-react';
import type { SupportConversation } from '@shared/types';
import { MAX_SUPPORT_MESSAGE_LENGTH } from '@shared/constants/support';
import { formatChatTime } from '@/lib/format';
import { useSupport } from '@/lib/support';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/states';
import { TypingIndicator } from '@/components/ui/TypingIndicator';

type Filter = 'open' | 'all';

export default function SupportDeskPage() {
  const {
    status,
    conversations,
    messagesByConversation,
    typingByConversation,
    error,
    send,
    notifyTyping,
    markRead,
    resolve,
    requestHistory,
    clearError,
  } = useSupport();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('open');
  const [draft, setDraft] = useState('');

  const visible = useMemo(
    () =>
      filter === 'open'
        ? conversations.filter((c) => c.status === 'open')
        : conversations,
    [conversations, filter],
  );

  const selected = conversations.find((c) => c.conversationId === selectedId);
  const messages = selectedId ? (messagesByConversation[selectedId] ?? []) : [];
  const typingPeer = selectedId ? typingByConversation[selectedId] : undefined;

  // Land on the thread that has been waiting longest for a reply, so an admin
  // opening this page is already looking at the thing that needs them.
  useEffect(() => {
    if (selectedId || visible.length === 0) return;
    const waiting = [...visible]
      .filter((c) => c.unreadForAdmin > 0)
      .sort((a, b) => a.lastMessageAt.localeCompare(b.lastMessageAt))[0];
    setSelectedId((waiting ?? visible[0])?.conversationId ?? null);
  }, [selectedId, visible]);

  // Opening a thread pulls its history and clears its unread count.
  useEffect(() => {
    if (!selectedId) return;
    requestHistory(selectedId);
    markRead(selectedId);
  }, [selectedId, requestHistory, markRead]);

  const totalUnread = conversations.reduce((n, c) => n + c.unreadForAdmin, 0);
  const overLimit = draft.length > MAX_SUPPORT_MESSAGE_LENGTH;

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !selectedId) return;
    clearError();
    send(text, selectedId);
    setDraft('');
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-brand-600">Support Desk</h2>
          <p className="mt-1 text-sm text-slate-500">
            Questions from Heads of Departments that the FAQ could not answer.
          </p>
        </div>

        <p
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
            status === 'online'
              ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
              : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-2 w-2 rounded-full ${
              status === 'online' ? 'bg-emerald-500' : 'bg-slate-400'
            }`}
          />
          {status === 'online'
            ? 'You appear online to HoDs'
            : status === 'connecting'
              ? 'Connecting…'
              : 'Offline — reconnecting'}
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}

      <div className="mt-5 flex gap-2">
        {(['open', 'all'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              filter === f
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f === 'open' ? 'Open' : 'All'}
            {f === 'open' && totalUnread > 0 && (
              <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[10px] text-white">
                {totalUnread}
              </span>
            )}
          </button>
        ))}
      </div>

      {conversations.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No questions yet"
            hint="When a HoD asks for help from the portal's help widget, their message appears here."
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[20rem_1fr]">
          <ConversationList
            conversations={visible}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          <section className="flex h-[32rem] flex-col overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center px-6 text-center">
                <p className="text-sm text-slate-500">
                  <Inbox className="mx-auto mb-2 h-8 w-8 text-slate-300" aria-hidden="true" />
                  Select a conversation to read and reply.
                </p>
              </div>
            ) : (
              <>
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-brand-700">
                      {selected.hodName}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {selected.hodEmail}
                      {selected.departments.length > 0 &&
                        ` · ${selected.departments.join(', ')}`}
                    </p>
                  </div>

                  {selected.status === 'open' ? (
                    <Button
                      variant="secondary"
                      onClick={() => resolve(selected.conversationId)}
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Mark resolved
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Resolved
                    </span>
                  )}
                </header>

                <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                  {messages.map((m) => {
                    const mine = m.authorRole === 'admin';
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                      >
                        <p className="mb-0.5 text-xs font-semibold text-slate-500">
                          {m.authorName}
                        </p>
                        <p
                          className={`max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                            mine
                              ? 'bg-brand-600 text-white'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {m.text}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {formatChatTime(m.sentAt)}
                        </p>
                      </div>
                    );
                  })}

                  {typingPeer && <TypingIndicator name={typingPeer.name} />}
                </div>

                <form
                  onSubmit={handleSend}
                  className="flex items-end gap-2 border-t border-slate-200 px-3 py-3"
                >
                  <div className="flex-1">
                    <textarea
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        // Throttled inside notifyTyping, so firing per
                        // keystroke is fine.
                        if (e.target.value.trim()) notifyTyping(selected.conversationId);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          e.currentTarget.form?.requestSubmit();
                        }
                      }}
                      rows={2}
                      placeholder={`Reply to ${selected.hodName}…`}
                      aria-label="Reply"
                      className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                    />
                    {overLimit && (
                      <p className="mt-1 text-xs text-red-600">
                        {draft.length} / {MAX_SUPPORT_MESSAGE_LENGTH} characters.
                      </p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    disabled={!draft.trim() || overLimit || status !== 'online'}
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Send reply</span>
                  </Button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: SupportConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (conversations.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
        Nothing open — every question has been resolved.
      </div>
    );
  }

  return (
    <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto rounded-lg bg-white ring-1 ring-slate-200">
      {conversations.map((c) => {
        const active = c.conversationId === selectedId;
        return (
          <li key={c.conversationId}>
            <button
              type="button"
              onClick={() => onSelect(c.conversationId)}
              aria-current={active ? 'true' : undefined}
              className={`w-full px-3 py-3 text-left transition ${
                active ? 'bg-brand-50' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {c.hodName}
                </p>
                {c.unreadForAdmin > 0 && (
                  <span
                    aria-label={`${c.unreadForAdmin} unread`}
                    className="shrink-0 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white"
                  >
                    {c.unreadForAdmin}
                  </span>
                )}
              </div>

              <p className="truncate text-xs text-slate-500">
                {c.departments.join(', ') || c.hodEmail}
              </p>

              <p className="mt-1 truncate text-xs text-slate-600">
                {c.lastMessagePreview || 'No messages yet'}
              </p>

              <p className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                {formatChatTime(c.lastMessageAt)}
                {c.status === 'resolved' && (
                  <span className="rounded-full bg-emerald-50 px-1.5 font-semibold text-emerald-700">
                    Resolved
                  </span>
                )}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
