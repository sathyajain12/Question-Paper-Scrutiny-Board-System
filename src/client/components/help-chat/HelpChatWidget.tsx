import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  HelpCircle,
  LifeBuoy,
  List,
  Phone,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import { askFaq, FAQ_ENTRIES, FAQ_FALLBACK, type FaqEntry } from '@shared/constants/faq';
import {
  isSupportPhoneConfigured,
  MAX_SUPPORT_MESSAGE_LENGTH,
  SUPPORT_PHONE,
  supportPhoneHref,
} from '@shared/constants/support';
import { formatChatTime } from '@/lib/format';
import { useSupport } from '@/lib/support';
import { Button } from '../ui/Button';
import { TypingIndicator } from '../ui/TypingIndicator';

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
  const [liveInput, setLiveInput] = useState('');

  const faqListRef = useRef<HTMLDivElement>(null);
  const liveListRef = useRef<HTMLDivElement>(null);

  const support = useSupport();
  const {
    presence,
    conversation,
    messagesByConversation,
    typingByConversation,
    status,
    error,
    send,
    notifyTyping,
    markRead,
    clearError,
  } = support;

  const liveMessages = conversation
    ? (messagesByConversation[conversation.conversationId] ?? [])
    : [];
  // Only ever one thread for a HoD, so it is keyed by their own conversation.
  const typingPeer = conversation
    ? typingByConversation[conversation.conversationId]
    : undefined;
  const unread = conversation?.unreadForHod ?? 0;
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

  function handleLiveSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = liveInput.trim();
    if (!text) return;
    clearError();
    send(text);
    setLiveInput('');
  }

  const headings: Record<View, { title: string; subtitle: string }> = {
    faq: { title: 'QPSB Help', subtitle: 'Ask a question about the portal' },
    browse: { title: 'All questions', subtitle: 'Pick any question to see its answer' },
    live: {
      title: 'Chat with the COE office',
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
                onClick={() => setView('faq')}
                aria-label="Back to help"
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
              typingName={typingPeer?.name}
              input={liveInput}
              onInput={(value) => {
                setLiveInput(value);
                if (value.trim()) notifyTyping();
              }}
              onSubmit={handleLiveSubmit}
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

function LiveView({
  listRef,
  adminOnline,
  adminNames,
  status,
  error,
  messages,
  typingName,
  input,
  onInput,
  onSubmit,
}: {
  listRef: React.RefObject<HTMLDivElement | null>;
  adminOnline: boolean;
  adminNames: string[];
  status: 'connecting' | 'online' | 'offline';
  error: string | null;
  messages: {
    id: string;
    authorName: string;
    authorRole: string;
    text: string;
    sentAt: string;
  }[];
  typingName: string | undefined;
  input: string;
  onInput: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const phoneConfigured = isSupportPhoneConfigured();
  const overLimit = input.length > MAX_SUPPORT_MESSAGE_LENGTH;

  return (
    <>
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

        {messages.map((m) => {
          const mine = m.authorRole === 'hod';
          return (
            <div
              key={m.id}
              className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
            >
              {!mine && (
                <p className="mb-0.5 text-xs font-semibold text-slate-500">
                  {m.authorName}
                </p>
              )}
              <p
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  mine ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'
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

      <form
        onSubmit={onSubmit}
        className="flex items-end gap-2 border-t border-slate-200 px-3 py-3"
      >
        <div className="flex-1">
          <textarea
            value={input}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter is a newline — the convention every
              // chat app has trained people on.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            placeholder="Describe your issue…"
            aria-label="Message the COE office"
            className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
          />
          {overLimit && (
            <p className="mt-1 text-xs text-red-600">
              {input.length} / {MAX_SUPPORT_MESSAGE_LENGTH} characters.
            </p>
          )}
        </div>
        <Button type="submit" disabled={!input.trim() || overLimit || status !== 'online'}>
          <Send className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </>
  );
}
