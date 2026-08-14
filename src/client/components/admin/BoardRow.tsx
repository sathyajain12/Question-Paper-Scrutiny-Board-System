import type { BoardSummary } from '@shared/types';
import { formatDateLong } from '@/lib/format';
import { useBoard } from '@/lib/hooks';
import { StatusBadge } from '../ui/StatusBadge';
import { BoardActions } from './BoardActions';

/**
 * One row of the admin table. Detail is fetched per row so the actions have
 * the current `version` to send; React Query dedupes and caches these.
 */
export function BoardRow({ summary }: { summary: BoardSummary }) {
  const { data } = useBoard(summary.boardId);
  const board = data?.board;

  const scheduled = board?.availableDates.filter((d) => d.isSelected) ?? [];

  return (
    <tr className="align-top">
      <td className="px-3 py-3">
        <p className="font-semibold text-brand-600">{summary.programme}</p>
        <p className="text-xs text-slate-500">{summary.department}</p>
      </td>

      <td className="px-3 py-3 text-slate-600">{summary.degreeShort}</td>

      <td className="px-3 py-3">
        <StatusBadge status={summary.status} />
      </td>

      <td className="px-3 py-3 text-xs text-slate-600">
        {summary.submittedBy ?? '—'}
      </td>

      <td className="px-3 py-3 text-xs text-slate-600">
        {scheduled.length > 0 ? (
          <>
            {scheduled.map((d) => formatDateLong(d.date)).join(' · ')}
            {board?.sessionTime && (
              <span className="block font-semibold">{board.sessionTime}</span>
            )}
          </>
        ) : (
          '—'
        )}
      </td>

      <td className="px-3 py-3">
        {board && board.members.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {board.members.map((m) => (
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

      <td className="min-w-56 px-3 py-3">
        {board ? (
          <BoardActions board={board} />
        ) : (
          <span className="text-xs text-slate-400">Loading…</span>
        )}
      </td>
    </tr>
  );
}
