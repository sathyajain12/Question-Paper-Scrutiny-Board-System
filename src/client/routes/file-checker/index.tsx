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
import { useBoards, useCheck, useSession } from '@/lib/hooks';

export default function FileCheckerPage() {
  const { data: user } = useSession();
  const { data: boardData, isPending: boardsPending } = useBoards();

  const isAdmin = user?.role === 'admin';
  const [boardId, setBoardId] = useState<string>('');
  const [type, setType] = useState<CheckType>(isAdmin ? 'pre' : 'post');
  const [problemsOnly, setProblemsOnly] = useState(false);

  const { data: result, isFetching, error } = useCheck(boardId || null, type);

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
            onChange={(e) => setBoardId(e.target.value)}
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
            <a
              href={result.folderUrl}
              target="_blank"
              rel="noreferrer"
              className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
            >
              {result.folderName}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <CheckMatrix result={result} type={type} problemsOnly={problemsOnly} />
          </>
        )}
      </div>
    </div>
  );
}
