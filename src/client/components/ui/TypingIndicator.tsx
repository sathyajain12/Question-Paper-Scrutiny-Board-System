/**
 * "<name> is typing…" — the animated bubble shown in a support conversation.
 *
 * Shared by the HoD widget and the admin desk so both sides look identical.
 * The dots are decorative (`aria-hidden`); the sentence beside them is what a
 * screen reader announces, and the wrapper is a polite live region so it is
 * announced without interrupting whatever the user is doing.
 */
const DOT_DELAYS_MS = [0, 160, 320];

export function TypingIndicator({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-start" aria-live="polite">
      <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2">
        <span className="flex items-center gap-1" aria-hidden="true">
          {DOT_DELAYS_MS.map((delay) => (
            <span
              key={delay}
              className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-slate-500"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
        <span className="text-xs text-slate-600">{name} is typing…</span>
      </div>
    </div>
  );
}
