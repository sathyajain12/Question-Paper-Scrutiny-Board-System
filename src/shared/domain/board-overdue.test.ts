/**
 * The overdue rule drives a red, pulsing row in the admin portal, so a false
 * positive is an accusation against a HoD who did nothing wrong. These tests
 * pin the boundary precisely rather than "about two days".
 */
import { describe, expect, it } from 'vitest';
import type { BoardStatus, BoardSummary } from '../types';
import {
  daysSinceSession,
  filesOverdue,
  lastSessionDate,
  overdueLabel,
} from './board-overdue';

function board(overrides: Partial<BoardSummary> = {}): BoardSummary {
  return {
    boardId: 'bsc-mathematics-2026',
    degree: 'Bachelor of Science',
    degreeShort: 'B.Sc.',
    department: 'Mathematics',
    programme: 'B.Sc. Mathematics (Hons.)',
    status: 'Locked' as BoardStatus,
    courseCount: 4,
    submittedBy: 'math1@sssihl.edu.in',
    submittedAt: '2026-07-28T08:30:00Z',
    members: [],
    availableDates: [
      { date: '2026-09-02', isSelected: true },
      { date: '2026-09-03', isSelected: true },
      { date: '2026-09-05', isSelected: false },
    ],
    sessionTime: '9:30 AM',
    changesRequested: false,
    filesCompleteAt: null,
    closed: false,
    version: 7,
    ...overrides,
  };
}

const at = (iso: string) => new Date(iso);

describe('lastSessionDate', () => {
  it('takes the last selected date, not the first', () => {
    // A two-day board is still sitting on day one.
    expect(lastSessionDate(board())).toBe('2026-09-03');
  });

  it('ignores dates that were offered but not chosen', () => {
    expect(lastSessionDate(board())).not.toBe('2026-09-05');
  });

  it('is null when nothing is confirmed', () => {
    expect(
      lastSessionDate(board({ availableDates: [{ date: '2026-09-02', isSelected: false }] })),
    ).toBeNull();
  });
});

describe('daysSinceSession', () => {
  it('is zero on the last session day', () => {
    expect(daysSinceSession(board(), at('2026-09-03T18:00:00Z'))).toBe(0);
  });

  it('counts whole days after it', () => {
    expect(daysSinceSession(board(), at('2026-09-06T01:00:00Z'))).toBe(3);
  });

  it('is negative before the session — a board scheduled ahead', () => {
    expect(daysSinceSession(board(), at('2026-09-01T12:00:00Z'))).toBe(-2);
  });
});

describe('filesOverdue', () => {
  it('is not overdue on the session day', () => {
    expect(filesOverdue(board(), at('2026-09-03T23:59:00Z'))).toBe(false);
  });

  it('is not overdue on day two — the HoD still has the window', () => {
    expect(filesOverdue(board(), at('2026-09-05T23:59:00Z'))).toBe(false);
  });

  it('becomes overdue on day three', () => {
    expect(filesOverdue(board(), at('2026-09-06T00:01:00Z'))).toBe(true);
  });

  it('stops once the HoD confirms the files', () => {
    expect(
      filesOverdue(
        board({ filesCompleteAt: '2026-09-04T10:00:00Z' }),
        at('2026-09-20T00:00:00Z'),
      ),
    ).toBe(false);
  });

  it('never flags a closed board', () => {
    expect(
      filesOverdue(board({ closed: true }), at('2026-09-20T00:00:00Z')),
    ).toBe(false);
  });

  it('never flags a board that has not reached Locked', () => {
    for (const status of ['NotSubmitted', 'Submitted', 'Approved', 'Rejected'] as const) {
      expect(filesOverdue(board({ status }), at('2026-09-20T00:00:00Z'))).toBe(false);
    }
  });

  it('never flags a board with no confirmed session', () => {
    expect(
      filesOverdue(
        board({ availableDates: [{ date: '2026-09-02', isSelected: false }] }),
        at('2026-09-20T00:00:00Z'),
      ),
    ).toBe(false);
  });

  it('keeps counting while corrections are outstanding', () => {
    // Changes requested means the HoD still owes the office something.
    expect(
      filesOverdue(board({ changesRequested: true }), at('2026-09-06T00:01:00Z')),
    ).toBe(true);
  });
});

describe('overdueLabel', () => {
  it('counts from the end of the grace period, not the session', () => {
    expect(overdueLabel(board(), at('2026-09-06T00:01:00Z'))).toBe('1 day overdue');
    expect(overdueLabel(board(), at('2026-09-08T00:01:00Z'))).toBe('3 days overdue');
  });

  it('is null when the board is not overdue', () => {
    expect(overdueLabel(board(), at('2026-09-04T00:00:00Z'))).toBeNull();
  });
});
