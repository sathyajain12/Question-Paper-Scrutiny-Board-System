/**
 * The repository contract. Everything above this layer speaks in domain
 * types and never learns that the data lives in Google Sheets.
 *
 * Two implementations: `mock-sheets.ts` (in-memory, for development) and
 * the live Sheets client (Phase 2). Swapping them is a factory change.
 */
import type {
  BoardDetail,
  BoardSummary,
  DashboardCounts,
  FacultyMember,
  SessionUser,
} from '@shared/types';

export interface AuditEntry {
  timestamp: string;
  actorEmail: string;
  action: string;
  boardId: string;
  beforeJson: string;
  afterJson: string;
}

export interface BoardRepo {
  // ── reads ──────────────────────────────────────────────────────────
  findUserAccess(email: string): Promise<SessionUser | null>;

  /** Scoped to what the user may see: admins get everything. */
  listBoards(user: SessionUser): Promise<BoardSummary[]>;
  countByStatus(user: SessionUser): Promise<DashboardCounts>;
  getBoard(boardId: string): Promise<BoardDetail | null>;
  listFaculty(department: string): Promise<FacultyMember[]>;

  // ── writes ─────────────────────────────────────────────────────────
  // Each takes the actor and the expected version; implementations must
  // reject a stale version rather than clobber (docs §7).
  submitConstitution(
    boardId: string,
    actor: SessionUser,
    facultyEmails: string[],
    expectedVersion: number,
  ): Promise<BoardDetail>;

  approve(
    boardId: string,
    actor: SessionUser,
    expectedVersion: number,
  ): Promise<BoardDetail>;

  reject(
    boardId: string,
    actor: SessionUser,
    reason: string,
    expectedVersion: number,
  ): Promise<BoardDetail>;

  offerDates(
    boardId: string,
    actor: SessionUser,
    dates: string[],
    expectedVersion: number,
  ): Promise<BoardDetail>;

  confirmSchedule(
    boardId: string,
    actor: SessionUser,
    dates: string[],
    time: string,
    expectedVersion: number,
  ): Promise<BoardDetail>;

  /** Append-only audit trail — never overwrite (docs §11 item 5). */
  appendAuditLog(entry: AuditEntry): Promise<void>;
}
