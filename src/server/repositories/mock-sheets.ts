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
  FacultyOverride,
  SessionUser,
} from '@shared/types';
import { ConflictError, VersionConflictError } from '../middleware/error';
import {
  FIXTURE_ACCESS,
  FIXTURE_BOARDS,
  FIXTURE_FACULTY,
  FIXTURE_FACULTY_OVERRIDES,
} from './fixtures';
import type { AuditEntry, BoardRepo, SaveFacultyOverrideInput } from './types';

// Deep clone so mutations don't leak back into the fixture module.
let boards: BoardDetail[] = structuredClone(FIXTURE_BOARDS);
let facultyOverrides: FacultyOverride[] = structuredClone(
  FIXTURE_FACULTY_OVERRIDES,
);
const auditLog: AuditEntry[] = [];

/** Test hook — restores fixtures between runs. */
export function resetMockData(): void {
  boards = structuredClone(FIXTURE_BOARDS);
  facultyOverrides = structuredClone(FIXTURE_FACULTY_OVERRIDES);
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

const sameEmail = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();

function baseFacultyFor(department: string): FacultyMember[] {
  return FIXTURE_FACULTY.filter((f) => f.department === department);
}

function overridesFor(department: string): FacultyOverride[] {
  return facultyOverrides.filter((o) => o.department === department);
}

/**
 * The faculty a HoD may actually nominate. Applied on every read so the
 * picker, the submit validation and the admin preview cannot disagree.
 */
function effectiveFacultyFor(department: string): FacultyMember[] {
  const scoped = overridesFor(department);
  const excluded = new Set(
    scoped.filter((o) => o.action === 'exclude').map((o) => o.email.toLowerCase()),
  );

  const added: FacultyMember[] = scoped
    .filter((o) => o.action === 'add')
    .map((o) => ({
      email: o.email,
      name: o.name,
      campus: o.campus,
      department: o.department,
    }));

  return [
    ...baseFacultyFor(department).filter(
      (f) => !excluded.has(f.email.toLowerCase()),
    ),
    ...added,
  ].sort((a, b) => a.name.localeCompare(b.name));
}

/** Department-scoped audit entry — no board is involved (see AuditEntry). */
function recordOverride(
  actor: SessionUser,
  action: string,
  before: FacultyOverride | null,
  after: FacultyOverride | null,
): void {
  auditLog.push({
    timestamp: new Date().toISOString(),
    actorEmail: actor.email,
    action,
    boardId: '',
    beforeJson: JSON.stringify(before),
    afterJson: JSON.stringify(after),
  });
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
      return effectiveFacultyFor(department);
    },

    async listBaseFaculty(department) {
      return baseFacultyFor(department);
    },

    async listFacultyOverrides(department) {
      return overridesFor(department).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    },

    async listDepartments() {
      return [
        ...new Set([
          ...FIXTURE_FACULTY.map((f) => f.department),
          ...facultyOverrides.map((o) => o.department),
        ]),
      ].sort();
    },

    async findCampus({ name, email }) {
      const match = FIXTURE_FACULTY.find(
        (f) =>
          (email && sameEmail(f.email, email)) ||
          (name && f.name.toLowerCase() === name.trim().toLowerCase()),
      );
      // Fall back to an existing override, so re-adding someone the admin
      // already added elsewhere still fills the campus in.
      const fromOverride = facultyOverrides.find(
        (o) =>
          (email && sameEmail(o.email, email)) ||
          (name && o.name.toLowerCase() === name.trim().toLowerCase()),
      );
      return match?.campus ?? fromOverride?.campus ?? null;
    },

    async saveFacultyOverride(input: SaveFacultyOverrideInput, actor) {
      const inBaseList = baseFacultyFor(input.department).some((f) =>
        sameEmail(f.email, input.email),
      );

      if (input.action === 'exclude' && !inBaseList) {
        throw new ConflictError(
          `${input.name} has no Faculty record in ${input.department} — remove the “add” override instead of excluding them.`,
        );
      }

      if (input.action === 'add' && inBaseList) {
        throw new ConflictError(
          `${input.name} already appears in ${input.department}. Nothing to add.`,
        );
      }

      const existingIndex = facultyOverrides.findIndex(
        (o) => o.department === input.department && sameEmail(o.email, input.email),
      );
      const before =
        existingIndex >= 0 ? structuredClone(facultyOverrides[existingIndex]!) : null;

      const saved: FacultyOverride = {
        ...input,
        email: input.email.toLowerCase(),
        createdBy: actor.email,
        createdAt: new Date().toISOString(),
      };

      // Upsert: one override per person per department.
      if (existingIndex >= 0) facultyOverrides[existingIndex] = saved;
      else facultyOverrides.push(saved);

      recordOverride(actor, 'saveFacultyOverride', before, saved);
      return saved;
    },

    async deleteFacultyOverride(department, email, actor) {
      const index = facultyOverrides.findIndex(
        (o) => o.department === department && sameEmail(o.email, email),
      );
      if (index < 0) return; // Idempotent.

      const [removed] = facultyOverrides.splice(index, 1);
      recordOverride(actor, 'deleteFacultyOverride', removed ?? null, null);
    },

    async submitConstitution(boardId, actor, facultyEmails, expectedVersion) {
      const board = mustFind(boardId);
      checkVersion(board, expectedVersion);
      const before = structuredClone(board);

      board.status = assertTransition('submitConstitution', board.status, actor.role);

      // Resolved against the department's *effective* list, so an excluded
      // faculty member cannot be nominated by a crafted request — and an
      // admin-added one can.
      const selectable = effectiveFacultyFor(board.department);
      board.members = facultyEmails.map((email) => {
        const f = selectable.find((x) => sameEmail(x.email, email));
        if (!f) {
          throw new ConflictError(
            `${email} is not available for nomination in ${board.department}.`,
          );
        }
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
