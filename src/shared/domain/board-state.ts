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
  /** Omitted when the action only flips a flag and leaves the status alone. */
  to?: BoardStatus;
  allowedRoles: Role[];
}

const ANY_STATUS: BoardStatus[] = [
  'NotSubmitted',
  'Submitted',
  'Approved',
  'Rejected',
  'Locked',
];

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
  // Corrections the office wants from the HoD. Allowed from any status and
  // leaves it untouched: a constitution can need fixing before it is ever
  // approved, not only once the board is scheduled and the files are in.
  requestChanges: {
    from: ANY_STATUS,
    allowedRoles: ['admin'],
  },
  acknowledgeChanges: {
    from: ANY_STATUS,
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

/** Throws unless the action is legal; returns the resulting status — which,
 * for a flag-only action, is the status the board already had. */
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

  return t.to ?? from;
}

export const STATUS_LABELS: Record<BoardStatus, string> = {
  NotSubmitted: 'Not Submitted',
  Submitted: 'Submitted',
  Approved: 'Approved',
  Rejected: 'Rejected',
  Locked: 'Scheduled',
};
