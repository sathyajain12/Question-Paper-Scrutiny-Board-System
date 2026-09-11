import { useCallback } from 'react';
import { CheckCircle2, Users } from 'lucide-react';
import type { BoardSummary } from '@shared/types';
import { useExitList } from '@/lib/motion';
import { StatusBadge } from '../ui/StatusBadge';
import { BoardActions } from './BoardActions';

/**
 * The boards whose next move belongs to the office.
 *
 * Two cases, and only two: a board awaiting approval, and an approved board
 * with no dates offered yet. Everything else on this screen is waiting on a
 * Head of Department, which is exactly why it belongs in the table below
 * rather than here.
 *
 * Putting the action UI on cards instead of in table cells is what lets the
 * table stay dense: a rejection textarea and four date inputs need room, and
 * giving them room inside a `<td>` is what made rows three times taller than
 * their neighbours.
 */
export function needsAction(board: BoardSummary): boolean {
  if (board.status === 'Submitted') return true;
  return board.status === 'Approved' && board.availableDates.length === 0;
}

/** Days since submission — the only ageing signal the list payload can support. */
function waitedFor(board: BoardSummary): string | null {
  if (!board.submittedAt) return null;
  const submitted = new Date(board.submittedAt);
  if (Number.isNaN(submitted.getTime())) return null;

  const days = Math.floor((Date.now() - submitted.getTime()) / 86_400_000);
  if (days <= 0) return 'submitted today';
  return `waiting ${days} ${days === 1 ? 'day' : 'days'}`;
}

export function ActionQueue({ boards }: { boards: BoardSummary[] }) {
  // Approving a board simply stops it matching `needsAction`, so without this
  // the card vanishes mid-blink and the click feels like it did nothing.
  const keyOf = useCallback((board: BoardSummary) => board.boardId, []);
  const entries = useExitList(boards, keyOf);

  return (
    <section className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold tracking-wide text-slate-700 uppercase">
          Needs you
        </h3>
        <p className="text-xs text-slate-500">
          Everything else is waiting on a Head of Department
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-white px-4 py-6 text-sm text-slate-600 ring-1 ring-slate-200">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          Nothing waiting on the office right now.
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {entries.map(({ item: board, key, exiting }) => (
            <li
              key={key}
              // A departing card is inert: it is on its way out, and a second
              // click on a button that no longer applies would only 409.
              aria-hidden={exiting}
              className={`flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 motion-safe:transition motion-safe:duration-200 motion-safe:ease-out ${
                exiting
                  ? 'pointer-events-none scale-95 opacity-0'
                  : 'scale-100 opacity-100'
              }`}
            >
              <div>
                <p className="text-base leading-snug font-bold text-brand-600">
                  {board.programme}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {board.department} · {board.courseCount} courses
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={board.status} />
                <span className="text-xs text-slate-400">
                  {board.status === 'Approved'
                    ? 'no dates offered yet'
                    : waitedFor(board)}
                </span>
              </div>

              {board.members.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  {board.members.map((m) => (
                    <span
                      key={m.email}
                      className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700"
                    >
                      {m.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-auto">
                <BoardActions board={board} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
