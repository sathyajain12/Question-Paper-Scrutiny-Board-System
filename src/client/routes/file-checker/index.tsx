/**
 * Tab 2 — QPSB File Checker.
 *
 * The old portal made admins walk three cascading dropdowns (degree →
 * department → programme) to identify a board. Since the API is now
 * boardId-centric, one grouped select does the same job in a single choice,
 * and HoDs see only their own programmes because the list endpoint is
 * already role-scoped.
 *
 * HoDs get the post-QPSB check only; the server enforces that too.
 */
import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { CheckType } from '@shared/constants/folder-spec';
import type { BoardSummary } from '@shared/types';
import { CheckMatrix } from '@/components/check/CheckMatrix';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import {
  useBoard,
  useBoards,
  useCheck,
  useSession,
  useNotifyAdmin,
  useAcknowledgeChanges,
  useCloseBoard,
} from '@/lib/hooks';

export default function FileCheckerPage() {
  const { data: user } = useSession();
  const { data: boardData, isPending: boardsPending } = useBoards();

  const isAdmin = user?.role === 'admin';
  const [boardId, setBoardId] = useState<string>('');
  const [type, setType] = useState<CheckType>(isAdmin ? 'pre' : 'post');
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [workNotified, setWorkNotified] = useState(false);
  const [changesNotified, setChangesNotified] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const { data: result, isFetching, error } = useCheck(boardId || null, type);
  // Detail carries version plus the HoD's "changes requested" flag and the
  // admin's "closed" flag — cheap enough to fetch for either role.
  const { data: boardDetail } = useBoard(boardId || null);
  const board = boardDetail?.board;

  const notifyWorkDone = useNotifyAdmin(boardId);
  const acknowledgeChanges = useAcknowledgeChanges(boardId);
  const closeBoard = useCloseBoard(boardId);

  const handleBoardIdChange = (id: string) => {
    setBoardId(id);
    setWorkNotified(false);
    setChangesNotified(false);
    setConfirmingClose(false);
    notifyWorkDone.reset();
    acknowledgeChanges.reset();
    closeBoard.reset();
  };

  const handleNotifyWorkDone = () => {
    notifyWorkDone.mutate(undefined, {
      onSuccess: () => setWorkNotified(true),
    });
  };

  const handleNotifyChangesFixed = () => {
    if (!board) return;
    acknowledgeChanges.mutate(
      { version: board.version },
      { onSuccess: () => setChangesNotified(true) },
    );
  };

  const handleCloseBoard = () => {
    if (!board) return;
    closeBoard.mutate(
      { version: board.version },
      { onSuccess: () => setConfirmingClose(false) },
    );
  };

  // Group by degree so a long programme list stays scannable.
  const grouped = Object.entries(
    (boardData?.boards ?? []).reduce<Record<string, BoardSummary[]>>((acc, b) => {
      (acc[b.degree] ??= []).push(b);
      return acc;
    }, {}),
  );

  return (
    <div>
      <h2 className="text-lg font-bold text-brand-600">QPSB File Checker</h2>
      <p className="mt-1 text-sm text-slate-500">
        Verify that every course folder holds the files the Board expects.
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-4 rounded-lg bg-slate-50 p-4">
        <label className="text-xs font-semibold text-slate-600">
          Programme
          <select
            value={boardId}
            onChange={(e) => handleBoardIdChange(e.target.value)}
            disabled={boardsPending}
            className="mt-1 block w-72 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
          >
            <option value="">— Select a programme —</option>
            {grouped.map(([degree, boards]) => (
              <optgroup key={degree} label={degree}>
                {boards.map((b) => (
                  <option key={b.boardId} value={b.boardId}>
                    {b.programme}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {isAdmin && (
          <fieldset>
            <legend className="text-xs font-semibold text-slate-600">
              Check type
            </legend>
            <div className="mt-1 flex gap-2">
              {(['pre', 'post'] as const).map((t) => (
                <label
                  key={t}
                  className={`cursor-pointer rounded-full px-4 py-2 text-sm ring-1 transition ${
                    type === t
                      ? 'bg-brand-600 font-semibold text-white ring-brand-600'
                      : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="check-type"
                    className="sr-only"
                    checked={type === t}
                    onChange={() => setType(t)}
                  />
                  {t === 'pre' ? 'Pre-QPSB' : 'Post-QPSB'}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {result && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={problemsOnly}
              onChange={(e) => setProblemsOnly(e.target.checked)}
              className="h-4 w-4 accent-brand-600"
            />
            Show only courses with problems
          </label>
        )}
      </div>

      <div className="mt-5">
        {!boardId && (
          <EmptyState
            title="Select a programme"
            hint="Choose a programme above to run the file check."
          />
        )}

        {boardId && isFetching && <LoadingState label="Checking Drive folders…" />}
        {error && <ErrorState error={error} />}

        {result && !isFetching && (
          <>
            {!isAdmin && board?.changesRequested && !changesNotified && (
              <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
                The admin has requested corrections to these files. Fix them, then click{' '}
                <strong>Changes Fixed — Notify Admin</strong> below.
              </div>
            )}
            {workNotified && (
              <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
                Admin has been notified that the QPSB files for {result.folderName} are ready.
              </div>
            )}
            {changesNotified && (
              <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
                Admin has been notified that the requested corrections are done.
              </div>
            )}
            {notifyWorkDone.error && (
              <div className="mb-4">
                <ErrorState error={notifyWorkDone.error} />
              </div>
            )}
            {acknowledgeChanges.error && (
              <div className="mb-4">
                <ErrorState error={acknowledgeChanges.error} />
              </div>
            )}
            {isAdmin && board?.closed && (
              <div className="mb-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-300">
                🔒 Board closed — Drive access has been revoked and the HoD notified.
              </div>
            )}
            {closeBoard.error && (
              <div className="mb-4">
                <ErrorState error={closeBoard.error} />
              </div>
            )}

            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <a
                href={result.folderUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
              >
                {result.folderName}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>

              {isAdmin && type === 'post' && !board?.closed && (
                <div className="flex items-start gap-2">
                  {confirmingClose ? (
                    <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
                      <p className="max-w-xs">
                        This revokes all Drive access for this board and notifies the
                        HoD. This cannot be undone.
                      </p>
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmingClose(false)}
                          className="inline-flex items-center justify-center rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleCloseBoard}
                          disabled={closeBoard.isPending}
                          className="inline-flex items-center justify-center rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                        >
                          {closeBoard.isPending ? 'Closing…' : 'Confirm close'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingClose(true)}
                      className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                    >
                      🔒 Close Board — De-Share Folder
                    </button>
                  )}
                </div>
              )}

              {!isAdmin && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleNotifyWorkDone}
                    disabled={notifyWorkDone.isPending}
                    className="inline-flex items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50"
                  >
                    {notifyWorkDone.isPending ? 'Notifying…' : 'Work Done — Notify Admin'}
                  </button>

                  <button
                    type="button"
                    onClick={handleNotifyChangesFixed}
                    disabled={!board?.changesRequested || acknowledgeChanges.isPending}
                    title={
                      board?.changesRequested
                        ? undefined
                        : 'Enabled once the admin requests corrections'
                    }
                    className="inline-flex items-center justify-center rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {acknowledgeChanges.isPending ? 'Notifying…' : 'Changes Fixed — Notify Admin'}
                  </button>
                </div>
              )}
            </div>

            <CheckMatrix result={result} type={type} problemsOnly={problemsOnly} />
          </>
        )}
      </div>
    </div>
  );
}
