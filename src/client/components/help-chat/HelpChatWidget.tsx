import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  HelpCircle,
  LifeBuoy,
  List,
  Phone,
  Plus,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import type {
  SupportBoardOption,
  SupportConversation,
  SupportMessage,
} from '@shared/types';
import { askFaq, FAQ_ENTRIES, FAQ_FALLBACK, type FaqEntry } from '@shared/constants/faq';
import {
  isSupportPhoneConfigured,
  SUPPORT_PHONE,
  supportPhoneHref,
} from '@shared/constants/support';
import { formatChatTime } from '@/lib/format';
import type { PreparedImage } from '@/lib/image';
import { useSupport } from '@/lib/support';
import { Button } from '../ui/Button';
import { TypingIndicator } from '../ui/TypingIndicator';
import { MessageBubble } from '../support/MessageBubble';
import { MessageComposer } from '../support/MessageComposer';

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  /** Present only on a bot message offering a few ranked guesses instead of one answer. */
  suggestions?: FaqEntry[];
}

/**
 * Three views behind one launcher:
 *
 *   faq    — the canned-answer transcript (the default)
 *   browse — every question, grouped by category
 *   live   — a real conversation with whoever is on the desk
 *
 * `browse` exists because the original widget showed its suggested questions
 * only while the transcript was empty: ask one thing and the list was gone
 * for good, with no way back to it. The list is now a first-class view
 * reachable at any time, and every view except `faq` has a back arrow.
 */
type View = 'faq' | 'browse' | 'live';

/** One representative question per category, shown before the HoD types anything. */
const SUGGESTED_CATEGORIES = [
  'Board Constitution',
  'Status & Approval',
  'Scheduling',
  'File Checker',
  'Notify Buttons',
];

function suggestedQuestions(): FaqEntry[] {
  return SUGGESTED_CATEGORIES.map((category) =>
    FAQ_ENTRIES.find((entry) => entry.category === category),
  ).filter((entry): entry is FaqEntry => entry !== undefined);
}

/** Category → its entries, in the order faq.ts declares them. */
function groupByCategory(): [string, FaqEntry[]][] {
  const groups = new Map<string, FaqEntry[]>();
  for (const entry of FAQ_ENTRIES) {
    const existing = groups.get(entry.category);
    if (existing) existing.push(entry);
    else groups.set(entry.category, [entry]);
  }
  return [...groups.entries()];
}

export function HelpChatWidget() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('faq');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');

  const faqListRef = useRef<HTMLDivElement>(null);
  const liveListRef = useRef<HTMLDivElement>(null);

  /**
   * Which of the HoD's threads is open. `null` shows the list; a thread only
   * exists on the server once its first message is sent, so "New question"
   * simply clears this and lets the composer create one.
   */
  const [threadId, setThreadId] = useState<string | null>(null);
  /**
   * Set when a message is sent with no thread open. The server mints the id,
   * so the widget adopts whichever thread comes back at the top of the list
   * rather than guessing one.
   */
  const awaitingNewThread = useRef(false);
  /** True while writing a question that has no thread on the server yet. */
  const [composingNew, setComposingNew] = useState(false);

  const support = useSupport();
  const {
    presence,
    conversations,
    messagesByConversation,
    typingByConversation,
    boards,
    setBoard,
    status,
    error,
    send,
    notifyTyping,
    markRead,
    requestHistory,
    clearError,
  } = support;

  const conversation = conversations.find((c) => c.conversationId === threadId);
  const liveMessages = threadId ? (messagesByConversation[threadId] ?? []) : [];
  const typingPeer = threadId ? typingByConversation[threadId] : undefined;
  /** Across every thread, so the launcher badge counts them all. */
  const unread = conversations.reduce((n, c) => n + c.unreadForHod, 0);
  const adminOnline = presence.adminsOnline > 0;

  const categories = useMemo(groupByCategory, []);

  useEffect(() => {
    faqListRef.current?.scrollTo({
      top: faqListRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  // The indicator appearing grows the transcript, so scroll for it too —
  // otherwise it shows up just below the fold, which is where it is useless.
  useEffect(() => {
    liveListRef.current?.scrollTo({
      top: liveListRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [liveMessages.length, view, typingPeer]);

  // Opening a thread pulls its transcript — the list arrives without one, so
  // a HoD with a dozen past questions is not sent a dozen transcripts.
  useEffect(() => {
    if (threadId) requestHistory(threadId);
  }, [threadId, requestHistory]);

  // The list is sorted by most recent activity, so the thread we just started
  // is the one at the top.
  useEffect(() => {
    if (!awaitingNewThread.current) return;
    const newest = conversations[0];
    if (!newest) return;
    awaitingNewThread.current = false;
    setComposingNew(false);
    setThreadId(newest.conversationId);
  }, [conversations]);

  // Reading the thread is what clears it — so the badge reflects "you haven't
  // looked", not "the server hasn't tried".
  useEffect(() => {
    if (open && view === 'live' && conversation && conversation.unreadForHod > 0) {
      markRead(conversation.conversationId);
    }
  }, [open, view, conversation, markRead]);

  function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;

    const result = askFaq(trimmed);
    const botMessage: ChatMessage =
      result.kind === 'answer'
        ? { role: 'bot', text: result.entry.answer }
        : result.kind === 'suggestions'
          ? {
              role: 'bot',
              text: 'I found a few things that might match — tap the closest one:',
              suggestions: result.entries,
            }
          : { role: 'bot', text: FAQ_FALLBACK.answer };

    setMessages((prev) => [...prev, { role: 'user', text: trimmed }, botMessage]);
    setInput('');
    setView('faq');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(input);
  }

  const headings: Record<View, { title: string; subtitle: string }> = {
    faq: { title: 'QPSB Help', subtitle: 'Ask a question about the portal' },
    browse: { title: 'All questions', subtitle: 'Pick any question to see its answer' },
    live: {
      // The reference is the thing a HoD can quote if they end up phoning.
      title: conversation ? conversation.reference : 'Chat with the COE office',
      subtitle: adminOnline
        ? `${presence.adminsOnline} ${presence.adminsOnline === 1 ? 'person' : 'people'} online`
        : 'No one is online right now',
    },
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close help' : 'Open help'}
        className="fixed right-6 bottom-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        {open ? (
          <X className="h-6 w-6" aria-hidden="true" />
        ) : (
          <HelpCircle className="h-6 w-6" aria-hidden="true" />
        )}

        {!open && unread > 0 && (
          <span
            aria-label={`${unread} unread ${unread === 1 ? 'reply' : 'replies'} from the COE office`}
            className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white ring-2 ring-white"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed right-6 bottom-24 z-50 flex h-[32rem] w-80 flex-col overflow-hidden rounded-lg bg-white shadow-xl ring-1 ring-slate-200 sm:w-96">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-brand-600 px-3 py-3">
            {view !== 'faq' && (
              <button
                type="button"
                onClick={() => {
                  // Inside a thread, back means the thread list — only leave
                  // the live view when there is no list to go back to.
                  const inThread = threadId !== null || composingNew;
                  if (view === 'live' && inThread && conversations.length > 0) {
                    setThreadId(null);
                    setComposingNew(false);
                    return;
                  }
                  setView('faq');
                }}
                aria-label="Back"
                className="rounded-md p-1 text-white transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">
                {headings[view].title}
              </p>
              <p className="flex items-center gap-1.5 truncate text-xs text-brand-100">
                {view === 'live' && (
                  <span
                    aria-hidden="true"
                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                      adminOnline ? 'bg-emerald-400' : 'bg-slate-400'
                    }`}
                  />
                )}
                {headings[view].subtitle}
              </p>
            </div>

            {view === 'faq' && messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                aria-label="Start over"
                title="Start over"
                className="rounded-md p-1 text-white transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {view === 'browse' && (
            <BrowseView categories={categories} onPick={ask} />
          )}

          {view === 'live' && (
            <LiveView
              listRef={liveListRef}
              adminOnline={adminOnline}
              adminNames={presence.adminNames}
              status={status}
              error={error}
              messages={liveMessages}
              conversation={conversation}
              conversations={conversations}
              showList={!threadId && !composingNew && conversations.length > 0}
              onOpenThread={(id) => {
                setComposingNew(false);
                setThreadId(id);
              }}
              onNewThread={() => {
                setThreadId(null);
                setComposingNew(true);
              }}
              boards={boards}
              onSetBoard={(boardId) => {
                if (threadId) setBoard(threadId, boardId);
              }}
              typingName={typingPeer?.name}
              onTyping={() => notifyTyping(threadId ?? undefined)}
              onSend={(text, image) => {
                clearError();
                // No thread selected means this opens a new one; the server
                // creates it and the echo tells us which id it got.
                if (!threadId) awaitingNewThread.current = true;
                send(text, threadId ?? undefined, image);
              }}
            />
          )}

          {view === 'faq' && (
            <>
              <div ref={faqListRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {messages.length === 0 && (
                  <>
                    <p className="text-sm text-slate-600">
                      Hi! Ask a question about the QPSB Constitution or File Checker
                      below, or try one of these:
                    </p>
                    <div className="flex flex-col items-start gap-2">
                      {suggestedQuestions().map((entry) => (
                        <QuestionChip
                          key={entry.id}
                          label={entry.question}
                          onClick={() => ask(entry.question)}
                        />
                      ))}
                    </div>
                  </>
                )}

                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <p
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        m.role === 'user'
                          ? 'bg-brand-600 text-white'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {m.text}
                    </p>

                    {m.suggestions && (
                      <div className="mt-2 flex max-w-[85%] flex-col items-start gap-1.5">
                        {m.suggestions.map((entry) => (
                          <QuestionChip
                            key={entry.id}
                            label={entry.question}
                            onClick={() => ask(entry.question)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Always present, so there is never a dead end: whatever the
                  bot just said, the full list and a real person are one tap
                  away. */}
              <div className="flex flex-wrap gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setView('browse')}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 transition hover:bg-brand-50"
                >
                  <List className="h-3.5 w-3.5" aria-hidden="true" />
                  Browse all questions
                </button>

                <button
                  type="button"
                  onClick={() => setView('live')}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 transition hover:bg-brand-50"
                >
                  <LifeBuoy className="h-3.5 w-3.5" aria-hidden="true" />
                  Talk to a person
                  <span
                    aria-hidden="true"
                    className={`ml-0.5 inline-block h-2 w-2 rounded-full ${
                      adminOnline ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  />
                  {unread > 0 && (
                    <span className="ml-0.5 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                      {unread}
                    </span>
                  )}
                </button>
              </div>

              <form
                onSubmit={handleSubmit}
                className="flex items-center gap-2 border-t border-slate-200 px-3 py-3"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your question…"
                  aria-label="Ask a question"
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                />
                <Button type="submit" disabled={!input.trim()}>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Send</span>
                </Button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}

function QuestionChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-brand-50 px-3 py-1.5 text-left text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
    >
      {label}
    </button>
  );
}

/** Every question, grouped — the "go back and pick another one" view. */
function BrowseView({
  categories,
  onPick,
}: {
  categories: [string, FaqEntry[]][];
  onPick: (question: string) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {categories.map(([category, entries]) => (
        <section key={category} className="mb-4 last:mb-0">
          <h3 className="mb-1.5 text-xs font-bold tracking-wide text-slate-500 uppercase">
            {category}
          </h3>
          <ul className="space-y-1">
            {entries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onPick(entry.question)}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-700 transition hover:bg-brand-50 hover:text-brand-700"
                >
                  {entry.question}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * A HoD's own threads.
 *
 * This list is the point of the change: a thread per question, rather than
 * every question a HoD ever asks piling into one transcript that can only be
 * resolved as a whole. The reference is shown because it is the thing they
 * can quote on the phone.
 */
function ThreadList({
  conversations,
  onOpen,
  onNew,
}: {
  conversations: SupportConversation[];
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <>
      <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
        {conversations.map((c) => (
          <li key={c.conversationId}>
            <button
              type="button"
              onClick={() => onOpen(c.conversationId)}
              className="w-full px-4 py-3 text-left transition hover:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="truncate text-sm font-semibold text-slate-800">
                  {c.subject}
                </span>
                {c.unreadForHod > 0 && (
                  <span
                    aria-label={`${c.unreadForHod} unread`}
                    className="shrink-0 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white"
                  >
                    {c.unreadForHod}
                  </span>
                )}
              </div>

              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                <span className="font-mono font-semibold text-slate-400">
                  {c.reference}
                </span>
                <span>{formatChatTime(c.lastMessageAt)}</span>
                {c.status === 'resolved' && (
                  <span className="rounded-full bg-emerald-50 px-1.5 font-semibold text-emerald-700">
                    Resolved
                  </span>
                )}
              </p>

              {c.boardProgramme && (
                <p className="mt-1 truncate text-xs text-brand-700">
                  {c.boardProgramme}
                </p>
              )}
            </button>
          </li>
        ))}
      </ul>

      <div className="border-t border-slate-200 px-3 py-3">
        <Button className="w-full justify-center" onClick={onNew}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New question
        </Button>
      </div>
    </>
  );
}

function LiveView({
  listRef,
  adminOnline,
  adminNames,
  status,
  error,
  messages,
  conversation,
  conversations,
  showList,
  onOpenThread,
  onNewThread,
  boards,
  onSetBoard,
  typingName,
  onSend,
  onTyping,
}: {
  listRef: React.RefObject<HTMLDivElement | null>;
  adminOnline: boolean;
  adminNames: string[];
  status: 'connecting' | 'online' | 'offline';
  error: string | null;
  messages: SupportMessage[];
  conversation: SupportConversation | undefined;
  conversations: SupportConversation[];
  showList: boolean;
  onOpenThread: (id: string) => void;
  onNewThread: () => void;
  boards: SupportBoardOption[];
  onSetBoard: (boardId: string | null) => void;
  typingName: string | undefined;
  onSend: (text: string, image?: PreparedImage) => void;
  onTyping: () => void;
}) {
  const phoneConfigured = isSupportPhoneConfigured();

  if (showList) {
    return (
      <ThreadList
        conversations={conversations}
        onOpen={onOpenThread}
        onNew={onNewThread}
      />
    );
  }

  return (
    <>
      {/* Saves the office its first question, which is almost always
          "which programme?". Only offered once a thread exists — there is
          nothing to attach it to before that. */}
      {boards.length > 0 && conversation && (
        <label className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="shrink-0 font-semibold">About</span>
          <select
            value={conversation.boardId ?? ''}
            onChange={(e) => onSetBoard(e.target.value || null)}
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
          >
            <option value="">No particular programme</option>
            {boards.map((b) => (
              <option key={b.boardId} value={b.boardId}>
                {b.programme}
              </option>
            ))}
          </select>
        </label>
      )}

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {/* The offline path the phone number exists for. It stays visible
            above the transcript rather than replacing it, so a HoD can still
            leave a message for the office to pick up later. */}
        {!adminOnline && (
          <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            <p className="font-semibold">No one is online on the portal right now.</p>
            <p className="mt-1 text-xs">
              You can still write below — the COE office will see it when they next
              sign in. If it can&rsquo;t wait, call:
            </p>

            {phoneConfigured ? (
              <a
                href={supportPhoneHref()}
                className="mt-2 inline-flex items-center gap-2 rounded-md bg-amber-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                {SUPPORT_PHONE.number}
              </a>
            ) : (
              <p className="mt-2 rounded-md bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900">
                The support number has not been configured yet — set
                <code className="mx-1 rounded bg-amber-200 px-1">SUPPORT_PHONE</code>
                in <code className="rounded bg-amber-200 px-1">shared/constants/support.ts</code>.
              </p>
            )}

            <p className="mt-2 text-xs">
              {SUPPORT_PHONE.label} · {SUPPORT_PHONE.hours}
            </p>
          </div>
        )}

        {adminOnline && adminNames.length > 0 && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900 ring-1 ring-emerald-200">
            <span className="font-semibold">{adminNames.join(', ')}</span>
            {adminNames.length === 1 ? ' is ' : ' are '}
            online and can reply now.
          </p>
        )}

        {messages.length === 0 && (
          <p className="text-sm text-slate-600">
            Describe the problem in your own words — include the programme name if it
            is about a specific board.
          </p>
        )}

        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            conversation={conversation}
            mine={m.authorRole === 'hod'}
            showAuthor
          />
        ))}

        {typingName && <TypingIndicator name={typingName} />}
      </div>

      {error && (
        <p role="alert" className="border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      )}

      {status !== 'online' && (
        <p className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
        </p>
      )}

      <MessageComposer
        placeholder="Describe your issue…"
        disabled={status !== 'online'}
        onSend={onSend}
        onTyping={onTyping}
      />
    </>
  );
}
