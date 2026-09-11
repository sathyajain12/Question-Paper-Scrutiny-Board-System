import { useMemo, useState } from 'react';
import { BarChart3, ChevronDown } from 'lucide-react';
import type { SupportConversation } from '@shared/types';
import { SUPPORT_CATEGORIES } from '@shared/constants/support';

/**
 * What the office keeps being asked.
 *
 * This is the one thing a ticket system gives you that a chat cannot: a chat
 * answers a question and forgets it, so nobody ever learns that the same
 * faculty-list problem was explained thirty times. Counting resolved threads
 * by category turns support traffic into a list of things worth fixing in the
 * portal or the FAQ.
 *
 * Deliberately plain: bars, not a charting library, and no date-range picker
 * until someone asks for one. The useful signal here is the ordering.
 */
export function ThemesReport({
  conversations,
}: {
  conversations: SupportConversation[];
}) {
  const [open, setOpen] = useState(false);

  const { rows, resolved, uncategorised } = useMemo(() => {
    const done = conversations.filter((c) => c.status === 'resolved');

    const counts = new Map<string, number>();
    for (const category of SUPPORT_CATEGORIES) counts.set(category, 0);

    let missing = 0;
    for (const c of done) {
      if (!c.category) {
        missing += 1;
        continue;
      }
      counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
    }

    return {
      rows: [...counts.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
      resolved: done.length,
      uncategorised: missing,
    };
  }, [conversations]);

  const highest = rows[0]?.count ?? 0;

  return (
    <section className="mt-6 rounded-lg bg-white ring-1 ring-slate-200">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <BarChart3 className="h-4 w-4 text-slate-400" aria-hidden="true" />
            What people keep asking
            <span className="font-normal text-slate-500">
              ({resolved} resolved)
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
              open ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>
      </h3>

      {open && (
        <div className="border-t border-slate-100 px-4 py-4">
          {resolved === 0 ? (
            <p className="text-sm text-slate-500">
              Nothing resolved yet. Categories are recorded when a thread is
              marked resolved, so this fills in as the office works through
              questions.
            </p>
          ) : (
            <>
              <ul className="space-y-2.5">
                {rows.map(({ category, count }) => (
                  <li key={category} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 text-xs text-slate-600">
                      {category}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className="block h-full rounded-full bg-brand-500 transition-[width] duration-500"
                        // Scaled against the biggest category, so the shape of
                        // the distribution is what you read, not the absolutes.
                        style={{
                          width: highest > 0 ? `${(count / highest) * 100}%` : '0%',
                        }}
                      />
                    </span>
                    <span className="w-8 shrink-0 text-right text-xs font-semibold text-slate-700">
                      {count}
                    </span>
                  </li>
                ))}
              </ul>

              {uncategorised > 0 && (
                <p className="mt-3 text-xs text-slate-400">
                  {uncategorised} resolved before categories were recorded.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
