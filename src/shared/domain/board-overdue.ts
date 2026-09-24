/**
 * Which boards are overdue on their post-QPSB files.
 *
 * After the scrutiny session is held, the Head of Department finalises the
 * files and presses "Notify admin — files complete". Until that happens the
 * office has no signal that the board is done, and the old portal's answer
 * was for someone to remember to chase it. This is the rule that chases it
 * instead.
 *
 * The clock starts at the **last session date**, not the first: a board
 * sitting over two days is scrutinising on both of them, and starting from
 * day one would flag it before the session had even finished.
 *
 * Kept out of the components so it can be tested against fixed dates rather
 * than whatever today happens to be.
 */
import type { BoardSummary } from '../types';

/** How long after the session the office waits before chasing. */
export const FILES_DUE_AFTER_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The last day the board actually sits, or null if nothing is confirmed. */
export function lastSessionDate(board: BoardSummary): string | null {
  const selected = board.availableDates
    .filter((d) => d.isSelected)
    .map((d) => d.date)
    .sort();

  return selected.length > 0 ? (selected[selected.length - 1] ?? null) : null;
}

/**
 * Whole days elapsed since the session finished, or null when the board has
 * no confirmed session yet.
 *
 * Dates are compared at UTC midnight. The sheet stores a calendar date with
 * no timezone, and treating "2026-09-03" as a local instant would shift the
 * deadline by a day either side of UTC.
 */
export function daysSinceSession(
  board: BoardSummary,
  now: Date = new Date(),
): number | null {
  const last = lastSessionDate(board);
  if (!last) return null;

  const sessionEnd = Date.parse(`${last}T00:00:00Z`);
  if (Number.isNaN(sessionEnd)) return null;

  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  return Math.floor((today - sessionEnd) / DAY_MS);
}

/**
 * Is this board overdue on its files?
 *
 * Four conditions, all required:
 *   - the session is scheduled and confirmed (`Locked`),
 *   - the board is not already closed — a closed board is finished,
 *   - the HoD has not pressed the button (`filesCompleteAt` is null), and
 *   - more than FILES_DUE_AFTER_DAYS have passed since the last session day.
 *
 * Deliberately *not* included: `changesRequested`. A board sent back for
 * corrections is still waiting on the HoD, so it should keep counting.
 */
export function filesOverdue(
  board: BoardSummary,
  now: Date = new Date(),
): boolean {
  if (board.status !== 'Locked') return false;
  if (board.closed) return false;
  if (board.filesCompleteAt) return false;

  const days = daysSinceSession(board, now);
  return days !== null && days > FILES_DUE_AFTER_DAYS;
}

/** "3 days overdue" — for the badge. Null when the board is not overdue. */
export function overdueLabel(
  board: BoardSummary,
  now: Date = new Date(),
): string | null {
  if (!filesOverdue(board, now)) return null;

  const days = daysSinceSession(board, now);
  if (days === null) return null;

  const late = days - FILES_DUE_AFTER_DAYS;
  return `${late} ${late === 1 ? 'day' : 'days'} overdue`;
}
