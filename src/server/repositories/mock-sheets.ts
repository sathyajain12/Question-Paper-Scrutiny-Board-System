/**
 * In-memory BoardRepo for development.
 *
 * Enforces the same rules the live repository will: the state machine, the
 * version check, and role/department scoping. Building the UI against this
 * means the client is written for real behaviour — including 409s — rather
 * than for a happy path that later disappears.
 *
 * State lives in module scope, so it resets whenever the Worker reloads.
 */
import { assertTransition } from '@shared/domain/board-state';
import type {
  BoardDetail,
  BoardSummary,
  DashboardCounts,
  FacultyMember,
  SessionUser,
} from '@shared/types';
import { VersionConflictError } from '../middleware/error';
import { FIXTURE_ACCESS, FIXTURE_BOARDS, FIXTURE_FACULTY } from './fixtures';
import type { AuditEntry, BoardRepo } from './types';

// Deep clone so mutations don't leak back into the fixture module.
let boards: BoardDetail[] = structuredClone(FIXTURE_BOARDS);
const auditLog: AuditEntry[] = [];

/** Test hook — restores fixtures between runs. */
export function resetMockData(): void {
  boards = structuredClone(FIXTURE_BOARDS);
  auditLog.length = 0;
}

function toSummary(b: BoardDetail): BoardSummary {
  const { boardId, degree, degreeShort, department, programme, status, courseCount, submittedBy, submittedAt, version } = b;
  return { boardId, degree, degreeShort, department, programme, status, courseCount, submittedBy, submittedAt, version };
}

function visibleTo(user: SessionUser): BoardDetail[] {
  if (user.role === 'admin' || user.role === 'viewer') return boards;
  return boards.filter((b) => user.departments.includes(b.department));
}

function mustFind(boardId: string): BoardDetail {
  const board = boards.find((b) => b.boardId === boardId);
  if (!board) throw new Error(`Board not found: ${boardId}`);
  return board;
}

function checkVersion(board: BoardDetail, expected: number): void {
  if (board.version !== expected) throw new VersionConflictError();
}

function record(board: BoardDetail, actor: SessionUser, action: string, before: BoardDetail): void {
  auditLog.push({
    timestamp: new Date().toISOString(),
    actorEmail: actor.email,
    action,
    boardId: board.boardId,
    beforeJson: JSON.stringify({ status: before.status, version: before.version }),
    afterJson: JSON.stringify({ status: board.status, version: board.version }),
  });
}

export function createMockRepo(): BoardRepo {
  return {
    async findUserAccess(email) {
      const row = FIXTURE_ACCESS.find(
        (a) => a.email.toLowerCase() === email.toLowerCase(),
      );
      return row
        ? { email: row.email, name: row.name, role: row.role, departments: [...row.departments] }
        : null;
    },

    async listBoards(user) {
      return visibleTo(user).map(toSummary);
    },

    async countByStatus(user) {
      const scoped = visibleTo(user);
      return {
        total: scoped.length,
        notSubmitted: scoped.filter((b) => b.status === 'NotSubmitted').length,
        submitted: scoped.filter((b) => b.status === 'Submitted').length,
        approved: scoped.filter((b) => b.status === 'Approved').length,
        rejected: scoped.filter((b) => b.status === 'Rejected').length,
        locked: scoped.filter((b) => b.status === 'Locked').length,
      } satisfies DashboardCounts;
    },

    async getBoard(boardId) {
      return boards.find((b) => b.boardId === boardId) ?? null;
    },

    async listFaculty(department) {
      return FIXTURE_FACULTY.filter(
        (f) => f.department === department,
      ) as FacultyMember[];
    },

    async submitConstitution(boardId, actor, facultyEmails, expectedVersion) {
      const board = mustFind(boardId);
      checkVersion(board, expectedVersion);
      const before = structuredClone(board);

      board.status = assertTransition('submitConstitution', board.status, actor.role);
      board.members = facultyEmails.map((email) => {
        const f = FIXTURE_FACULTY.find((x) => x.email === email);
        if (!f) throw new Error(`Unknown faculty: ${email}`);
        return f;
      });
      board.chairperson =
        FIXTURE_FACULTY.find((f) => f.name === actor.name) ?? board.chairperson;
      board.submittedBy = actor.email;
      board.submittedAt = new Date().toISOString();
      board.rejectionReason = null;
      board.version += 1;

      record(board, actor, 'submitConstitution', before);
      return board;
    },

    async approve(boardId, actor, expectedVersion) {
      const board = mustFind(boardId);
      checkVersion(board, expectedVersion);
      const before = structuredClone(board);

      board.status = assertTransition('approve', board.status, actor.role);
      board.actionBy = actor.email;
      board.actionAt = new Date().toISOString();
      board.version += 1;

      record(board, actor, 'approve', before);
      return board;
    },

    async reject(boardId, actor, reason, expectedVersion) {
      const board = mustFind(boardId);
      checkVersion(board, expectedVersion);
      const before = structuredClone(board);

      board.status = assertTransition('reject', board.status, actor.role);
      board.rejectionReason = reason;
      board.actionBy = actor.email;
      board.actionAt = new Date().toISOString();
      board.version += 1;

      record(board, actor, 'reject', before);
      return board;
    },

    async offerDates(boardId, actor, dates, expectedVersion) {
      const board = mustFind(boardId);
      checkVersion(board, expectedVersion);
      const before = structuredClone(board);

      board.status = assertTransition('offerDates', board.status, actor.role);
      board.availableDates = dates.map((date) => ({ date, isSelected: false }));
      board.version += 1;

      record(board, actor, 'offerDates', before);
      return board;
    },

    async confirmSchedule(boardId, actor, dates, time, expectedVersion) {
      const board = mustFind(boardId);
      checkVersion(board, expectedVersion);
      const before = structuredClone(board);

      board.status = assertTransition('confirmSchedule', board.status, actor.role);
      board.availableDates = board.availableDates.map((d) => ({
        ...d,
        isSelected: dates.includes(d.date),
      }));
      board.sessionTime = time;
      board.version += 1;

      record(board, actor, 'confirmSchedule', before);
      return board;
    },

    async appendAuditLog(entry) {
      auditLog.push(entry);
    },
  };
}
