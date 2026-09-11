/**
 * Tab 3 — Admin Portal.
 *
 * Two halves, deliberately: the boards whose next move is the office's, and
 * everything else. The old screen was a single uniform table in which a board
 * you could not act on looked exactly as important as one waiting on your
 * approval, and the same six statuses appeared twice — once as tiles, once as
 * filter chips.
 *
 * Every mutation sends the board's `version`; on 409 the client refetches and
 * tells the user someone else moved first (docs §7).
 */
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { BoardStatus, BoardSummary } from '@shared/types';
import { ActionQueue, needsAction } from '@/components/admin/ActionQueue';
import { AdminSkeleton } from '@/components/admin/AdminSkeleton';
import { BoardDrawer } from '@/components/admin/BoardDrawer';
import { BoardRow } from '@/components/admin/BoardRow';
import { SummaryCards, type AdminFilter } from '@/components/admin/SummaryCards';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useBoards } from '@/lib/hooks';

/** Table order: the boards needing attention first, then by how far along they are. */
const STAGE_ORDER: Record<BoardStatus, number> = {
  Submitted: 0,
  Approved: 1,
  Rejected: 2,
  NotSubmitted: 3,
  Locked: 4,
};

function matchesFilter(board: BoardSummary, filter: AdminFilter): boolean {
  if (filter === 'All') return true;
  if (filter === 'NeedsAction') return needsAction(board);
  return board.status === filter;
}

export default function AdminPage() {
  const { data, isPending, error } = useBoards();
  const [filter, setFilter] = useState<AdminFilter>('All');
  const [query, setQuery] = useState('');
  const [compact, setCompact] = useState(false);
  const [openBoardId, setOpenBoardId] = useState<string | null>(null);

  const boards = useMemo(() => data?.boards ?? [], [data]);
  const queue = useMemo(() => boards.filter(needsAction), [boards]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return boards
      .filter((b) => matchesFilter(b, filter))
      .filter(
        (b) =>
          !needle ||
          b.programme.toLowerCase().includes(needle) ||
          b.department.toLowerCase().includes(needle),
      )
      .sort(
        (a, b) =>
          STAGE_ORDER[a.status] - STAGE_ORDER[b.status] ||
          a.programme.localeCompare(b.programme),
      );
  }, [boards, filter, query]);

  // Reads from the list, so the drawer keeps working while it refetches.
  const openBoard = boards.find((b) => b.boardId === openBoardId);

  return (
    <div>
      <h2 className="text-lg font-bold text-brand-600">Admin Portal</h2>
      <p className="mt-1 text-sm text-slate-500">
        Board constitution status and session scheduling.
      </p>

      {isPending && <AdminSkeleton />}
      {error && <ErrorState error={error} />}

      {data && (
        <>
          <div className="mt-5">
            <SummaryCards
              counts={data.counts}
              needsAction={queue.length}
              active={filter}
              onSelect={setFilter}
            />
          </div>

          <div className="mt-6">
            <ActionQueue boards={queue} />
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold tracking-wide text-slate-700 uppercase">
              All boards
            </h3>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-md border border-slate-300 px-2.5 py-1.5 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
                <Search className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search programme or department"
                  aria-label="Search boards"
                  className="w-56 text-sm text-slate-800 focus:outline-none"
                />
              </label>

              <div className="flex overflow-hidden rounded-md border border-slate-300">
                {[
                  { label: 'Comfortable', value: false },
                  { label: 'Compact', value: true },
                ].map(({ label, value }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setCompact(value)}
                    aria-pressed={compact === value}
                    className={`px-3 py-1.5 text-xs font-semibold transition ${
                      compact === value
                        ? 'bg-brand-600 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No boards match"
                hint={
                  query
                    ? 'Try a different search, or clear the filter.'
                    : 'Nothing with this status.'
                }
              />
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-lg ring-1 ring-slate-200">
              <table className="w-full min-w-3xl border-collapse bg-white text-sm">
                <caption className="sr-only">
                  All QPSB boards, with their stage in the approval lifecycle.
                </caption>
                <thead>
                  <tr className="bg-slate-50 text-left text-xs tracking-wide text-slate-600 uppercase">
                    <th scope="col" className="px-3 py-2.5">Board</th>
                    <th scope="col" className="px-3 py-2.5">Degree</th>
                    <th scope="col" className="px-3 py-2.5">Progress</th>
                    <th scope="col" className="px-3 py-2.5">Submitted by</th>
                    <th scope="col" className="px-3 py-2.5">Session</th>
                    <th scope="col" className="px-3 py-2.5">Constitution</th>
                    <th scope="col" className="px-3 py-2.5">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((summary) => (
                    <BoardRow
                      key={summary.boardId}
                      summary={summary}
                      compact={compact}
                      open={summary.boardId === openBoardId}
                      onOpen={() => setOpenBoardId(summary.boardId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {openBoard && (
        <BoardDrawer board={openBoard} onClose={() => setOpenBoardId(null)} />
      )}
    </div>
  );
}
