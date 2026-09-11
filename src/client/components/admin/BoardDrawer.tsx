import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarCheck, X } from 'lucide-react';
import type { BoardSummary } from '@shared/types';
import { formatDateLong } from '@/lib/format';
import { useBoard } from '@/lib/hooks';
import { DRAWER_MS, prefersReducedMotion } from '@/lib/motion';
import { StatusBadge } from '../ui/StatusBadge';
import { ErrorState, LoadingState } from '../ui/states';
import { BoardActions } from './BoardActions';

/**
 * Everything about one board, in a panel with room for it.
 *
 * This is where the heavy controls moved to. A rejection needs a reason box
 * and offering dates needs four date inputs; rendered inside a table cell
 * they made rows wildly uneven and forced the whole table into horizontal
 * scroll. Here they have space, and the table keeps a fixed row height.
 *
 * It is also the only place the rest of `BoardDetail` is visible at all —
 * courses, the rejection reason, who acted and when — none of which the list
 * payload carries, and all of which were simply invisible before.
 */
export function BoardDrawer({
  board,
  onClose,
}: {
  board: BoardSummary;
  onClose: () => void;
}) {
  // Detail is fetched only when a board is actually opened, which is what
  // keeps the list to a single request for the whole page.
  const { data, isPending, error } = useBoard(board.boardId);
  const detail = data?.board;

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  /**
   * Drives the slide. It starts false so the panel mounts off-screen, then
   * flips on the next frame — a transition needs two painted states, and
   * setting both in the same frame would simply snap.
   */
  const [shown, setShown] = useState(false);
  const closing = useRef(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  /**
   * Play the panel out before unmounting it. React removes an element the
   * instant its condition goes false, so the exit has to be held here —
   * otherwise the drawer would slide in and then simply blink out.
   */
  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;

    if (prefersReducedMotion()) {
      onClose();
      return;
    }

    setShown(false);
    setTimeout(onClose, DRAWER_MS);
  }, [onClose]);

  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    // Return focus where it came from; a drawer that drops focus to <body>
    // strands keyboard users at the top of the document.
    return () => restoreTo.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        requestClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [requestClose]);

  const scheduled = detail?.availableDates.filter((d) => d.isSelected) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close panel"
        onClick={requestClose}
        className={`absolute inset-0 bg-slate-900/30 motion-safe:transition-opacity motion-safe:duration-200 ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Slides from the right so it is obvious where the panel came from —
          and, when it closes, where it went back to. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-drawer-title"
        className={`relative flex h-full w-full max-w-lg flex-col bg-white shadow-xl motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out ${
          shown ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="board-drawer-title"
              className="text-base font-bold text-brand-600"
            >
              {board.programme}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {board.department} · {board.degreeShort} · {board.courseCount} courses
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <StatusBadge status={board.status} />

          {isPending && <LoadingState label="Loading board…" />}
          {error && <ErrorState error={error} />}

          {detail && (
            <>
              {detail.rejectionReason && detail.status === 'Rejected' && (
                <div
                  role="alert"
                  className="rounded-md border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-900"
                >
                  <p className="font-semibold">Sent back to the HoD</p>
                  <p className="mt-0.5">{detail.rejectionReason}</p>
                </div>
              )}

              {scheduled.length > 0 && (
                <div className="rounded-md bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                    <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                    Scheduled
                  </p>
                  <p className="mt-1 text-sm text-emerald-800">
                    {scheduled.map((d) => formatDateLong(d.date)).join(' · ')}
                    {detail.sessionTime && ` at ${detail.sessionTime}`}
                  </p>
                </div>
              )}

              <Section title="Chairperson">
                <p className="text-sm text-slate-700">
                  {detail.chairperson?.name ?? '—'}
                </p>
              </Section>

              <Section title={`Board members (${detail.members.length})`}>
                {detail.members.length === 0 ? (
                  <p className="text-sm text-slate-400">Not yet nominated.</p>
                ) : (
                  <ul className="space-y-1">
                    {detail.members.map((m) => (
                      <li key={m.email} className="flex flex-wrap gap-x-2 text-sm">
                        <span className="font-medium text-slate-700">{m.name}</span>
                        <span className="text-slate-400">{m.campus}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title={`Courses (${detail.courses.length})`}>
                <ul className="space-y-1">
                  {detail.courses.map((c) => (
                    <li key={c.courseCode} className="flex gap-2 text-xs">
                      <span className="font-mono font-semibold text-brand-700">
                        {c.courseCode}
                      </span>
                      <span className="text-slate-600">{c.courseTitle}</span>
                    </li>
                  ))}
                </ul>
              </Section>

              <Section title="History">
                <dl className="space-y-1 text-xs">
                  <Row label="Submitted by" value={detail.submittedBy} at={detail.submittedAt} />
                  <Row label="Actioned by" value={detail.actionBy} at={detail.actionAt} />
                </dl>
              </Section>
            </>
          )}
        </div>

        <footer className="border-t border-slate-200 bg-slate-50 px-5 py-4">
          {detail ? (
            <BoardActions board={detail} />
          ) : (
            <span className="text-sm text-slate-400">Loading actions…</span>
          )}
        </footer>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-bold tracking-wide text-slate-500 uppercase">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  at,
}: {
  label: string;
  value: string | null;
  at: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-700">
        {value ?? '—'}
        {at && (
          <span className="text-slate-400">
            {' · '}
            {new Date(at).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        )}
      </dd>
    </div>
  );
}
