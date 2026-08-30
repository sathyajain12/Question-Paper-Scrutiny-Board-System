/**
 * The board lifecycle, stated once (docs/ARCHITECTURE.md §5).
 *
 * The old portal encoded this implicitly by hiding buttons in the UI, so a
 * crafted request could approve an already-locked board. Every mutation
 * endpoint must call `assertTransition` before touching Sheets.
 */
import type { BoardStatus, Role } from '../types';

export type BoardAction =
  | 'submitConstitution'
  | 'approve'
  | 'reject'
  | 'offerDates'
  | 'confirmSchedule'
  | 'requestChanges'
  | 'acknowledgeChanges'
  | 'closeBoard';

interface Transition {
  from: BoardStatus[];
  to: BoardStatus;
  allowedRoles: Role[];
}

export const TRANSITIONS: Record<BoardAction, Transition> = {
  // HoD submits, or resubmits after a rejection.
  submitConstitution: {
    from: ['NotSubmitted', 'Rejected'],
    to: 'Submitted',
    allowedRoles: ['hod'],
  },
  approve: {
    from: ['Submitted'],
    to: 'Approved',
    allowedRoles: ['admin'],
  },
  reject: {
    from: ['Submitted'],
    to: 'Rejected',
    allowedRoles: ['admin'],
  },
  // Admin offers candidate dates; status is unchanged.
  offerDates: {
    from: ['Approved'],
    to: 'Approved',
    allowedRoles: ['admin'],
  },
  // HoD picks date(s) + a start time, which finalises the board.
  confirmSchedule: {
    from: ['Approved'],
    to: 'Locked',
    allowedRoles: ['hod'],
  },
  // Post-QPSB file corrections: status stays Locked, only the flag flips —
  // mirrors offerDates staying within Approved.
  requestChanges: {
    from: ['Locked'],
    to: 'Locked',
    allowedRoles: ['admin'],
  },
  acknowledgeChanges: {
    from: ['Locked'],
    to: 'Locked',
    allowedRoles: ['hod'],
  },
  // Revokes Drive access once the QPSB session is done. Only Locked boards
  // reach here, and the repository additionally rejects a second close.
  closeBoard: {
    from: ['Locked'],
    to: 'Locked',
    allowedRoles: ['admin'],
  },
};

export class TransitionError extends Error {
  constructor(
    message: string,
    readonly code: 'FORBIDDEN_ROLE' | 'INVALID_STATE',
  ) {
    super(message);
    this.name = 'TransitionError';
  }
}

export function canTransition(
  action: BoardAction,
  from: BoardStatus,
  role: Role,
): boolean {
  const t = TRANSITIONS[action];
  return t.allowedRoles.includes(role) && t.from.includes(from);
}

/** Throws unless the action is legal; returns the resulting status. */
export function assertTransition(
  action: BoardAction,
  from: BoardStatus,
  role: Role,
): BoardStatus {
  const t = TRANSITIONS[action];

  if (!t.allowedRoles.includes(role)) {
    throw new TransitionError(
      `Role "${role}" may not perform "${action}".`,
      'FORBIDDEN_ROLE',
    );
  }

  if (!t.from.includes(from)) {
    throw new TransitionError(
      `Cannot "${action}" a board in state "${from}".`,
      'INVALID_STATE',
    );
  }

  return t.to;
}

export const STATUS_LABELS: Record<BoardStatus, string> = {
  NotSubmitted: 'Not Submitted',
  Submitted: 'Submitted',
  Approved: 'Approved',
  Rejected: 'Rejected',
  Locked: 'Scheduled',
};
