import { useEffect, useRef, useState } from 'react';
import { HelpCircle, Send, X } from 'lucide-react';
import { askFaq, FAQ_ENTRIES, FAQ_FALLBACK, type FaqEntry } from '@shared/constants/faq';
import { Button } from '../ui/Button';

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  /** Present only on a bot message offering a few ranked guesses instead of one answer. */
  suggestions?: FaqEntry[];
}

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

/**
 * A static FAQ presented as a chat — not a live AI chatbot. Every answer
 * comes from the canned FAQ_ENTRIES list via keyword search (faq.ts);
 * nothing here calls a server.
 */
export function HelpChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

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
              text: "I found a few things that might match — tap the closest one:",
              suggestions: result.entries,
            }
          : { role: 'bot', text: FAQ_FALLBACK.answer };

    setMessages((prev) => [...prev, { role: 'user', text: trimmed }, botMessage]);
    setInput('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(input);
  }

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
      </button>

      {open && (
        <div className="fixed right-6 bottom-24 z-50 flex h-[32rem] w-80 flex-col overflow-hidden rounded-lg bg-white shadow-xl ring-1 ring-slate-200 sm:w-96">
          <div className="border-b border-slate-200 bg-brand-600 px-4 py-3">
            <p className="text-sm font-bold text-white">QPSB Help</p>
            <p className="text-xs text-brand-100">Ask a question about the portal</p>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <>
                <p className="text-sm text-slate-600">
                  Hi! Ask a question about the QPSB Constitution or File Checker below, or
                  try one of these:
                </p>
                <div className="flex flex-col items-start gap-2">
                  {suggestedQuestions().map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => ask(entry.question)}
                      className="rounded-full bg-brand-50 px-3 py-1.5 text-left text-xs font-semibold text-brand-700 hover:bg-brand-100"
                    >
                      {entry.question}
                    </button>
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
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => ask(entry.question)}
                        className="rounded-full bg-brand-50 px-3 py-1.5 text-left text-xs font-semibold text-brand-700 hover:bg-brand-100"
                      >
                        {entry.question}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
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
        </div>
      )}
    </>
  );
}
