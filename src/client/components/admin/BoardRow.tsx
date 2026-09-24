import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { BoardSummary } from '@shared/types';
import { filesOverdue, overdueLabel } from '@shared/domain/board-overdue';
import { formatDateDMY } from '@/lib/format';
import { StatusTrack } from '../ui/StatusTrack';

/**
 * One row of the admin table.
 *
 * Everything rendered here comes from the list payload — this component makes
 * no request of its own. It used to call `useBoard()` per row purely to reach
 * `members` and `version`, which meant one request per board on every page
 * load and an Actions column that sat on "Loading…" while they landed.
 *
 * Actions now live in the drawer, so the row keeps a fixed height whatever
 * state the board is in.
 */
function sessionLabel(board: BoardSummary): string {
  const selected = board.availableDates.filter((d) => d.isSelected);

  if (selected.length > 0) {
    const dates = selected.map((d) => formatDateDMY(d.date)).join(' · ');
    return board.sessionTime ? `${dates}, ${board.sessionTime}` : dates;
  }

  if (board.availableDates.length > 0) {
    return `${board.availableDates.length} dates offered`;
  }

  return '—';
}

/** What the board is actually waiting on — more use than repeating the status. */
function stageHint(board: BoardSummary): string | undefined {
  if (board.status === 'Approved') {
    return board.availableDates.length === 0
      ? 'Needs session dates'
      : 'Dates offered — with the HoD';
  }
  return undefined;
}

export function BoardRow({
  summary,
  compact,
  open,
  onOpen,
}: {
  summary: BoardSummary;
  compact: boolean;
  /** Whether this row's drawer is showing — keeps your place in a long table. */
  open: boolean;
  onOpen: () => void;
}) {
  const pad = compact ? 'px-3 py-1.5' : 'px-3 py-3';

  // The session has been held and the HoD still hasn't confirmed the files.
  const overdue = filesOverdue(summary);
  const lateBy = overdueLabel(summary);

  const rowTone = overdue
    ? 'bg-red-50 hover:bg-red-100 qpsb-overdue'
    : open
      ? 'bg-brand-50'
      : 'hover:bg-slate-50';

  return (
    <tr
      aria-current={open ? 'true' : undefined}
      className={`align-middle transition ${rowTone}`}
    >
      <td className={pad}>
        <p className="font-semibold text-brand-600">{summary.programme}</p>
        <p className="text-xs text-slate-500">{summary.department}</p>

        {overdue && (
          // The colour alone would not reach a screen reader, or anyone who
          // cannot distinguish it — so the reason is written out too.
          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Files not confirmed · {lateBy}
          </p>
        )}
      </td>

      <td className={`${pad} text-slate-600`}>{summary.degreeShort}</td>

      <td className={pad}>
        <StatusTrack status={summary.status} hint={stageHint(summary)} />
      </td>

      <td className={`${pad} text-xs text-slate-600`}>
        {summary.submittedBy ?? '—'}
      </td>

      <td className={`${pad} text-xs text-slate-600`}>{sessionLabel(summary)}</td>

      <td className={pad}>
        {summary.members.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {summary.members.map((m) => (
              <span
                key={m.email}
                className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
              >
                {m.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>

      <td className={`${pad} text-right`}>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-brand-600 ring-1 ring-inset ring-brand-200 transition hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          Review
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">{summary.programme}</span>
        </button>
      </td>
    </tr>
  );
}
