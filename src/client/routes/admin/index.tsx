/**
 * Tab 3 — Admin Portal.
 *
 * Summary counts + the board table with inline actions: approve, reject with
 * a reason, offer session dates, send appointment emails once locked.
 *
 * Every mutation sends the board's `version`; on 409 the client refetches and
 * tells the user someone else moved first (docs §7).
 */
import { useState } from 'react';
import type { BoardStatus } from '@shared/types';
import { STATUS_LABELS } from '@shared/domain/board-state';
import { BoardRow } from '@/components/admin/BoardRow';
import { SummaryCards } from '@/components/admin/SummaryCards';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useBoards } from '@/lib/hooks';

const FILTERS: (BoardStatus | 'All')[] = [
  'All',
  'Submitted',
  'Approved',
  'NotSubmitted',
  'Rejected',
  'Locked',
];

export default function AdminPage() {
  const { data, isPending, error } = useBoards();
  const [filter, setFilter] = useState<BoardStatus | 'All'>('All');

  const rows =
    filter === 'All'
      ? data?.boards
      : data?.boards.filter((b) => b.status === filter);

  return (
    <div>
      <h2 className="text-lg font-bold text-brand-600">Admin Portal</h2>
      <p className="mt-1 text-sm text-slate-500">
        Board constitution status and session scheduling.
      </p>

      {isPending && <LoadingState label="Loading portal data…" />}
      {error && <ErrorState error={error} />}

      {data && (
        <>
          <div className="mt-5">
            <SummaryCards counts={data.counts} />
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  filter === f
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f === 'All' ? 'All' : STATUS_LABELS[f]}
              </button>
            ))}
          </div>

          {rows?.length === 0 ? (
            <div className="mt-4">
              <EmptyState title={`No boards with this status`} />
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg ring-1 ring-slate-200">
              <table className="w-full min-w-4xl border-collapse bg-white text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs tracking-wide text-slate-600 uppercase">
                    <th scope="col" className="px-3 py-2.5">Board</th>
                    <th scope="col" className="px-3 py-2.5">Degree</th>
                    <th scope="col" className="px-3 py-2.5">Status</th>
                    <th scope="col" className="px-3 py-2.5">Submitted by</th>
                    <th scope="col" className="px-3 py-2.5">Session</th>
                    <th scope="col" className="px-3 py-2.5">Constitution</th>
                    <th scope="col" className="px-3 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows?.map((summary) => (
                    <BoardRow key={summary.boardId} summary={summary} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
