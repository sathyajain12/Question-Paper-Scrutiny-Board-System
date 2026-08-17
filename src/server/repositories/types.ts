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
  FacultyOverride,
  FacultyOverrideAction,
  SessionUser,
} from '@shared/types';

export interface AuditEntry {
  timestamp: string;
  actorEmail: string;
  action: string;
  /**
   * Board slug, or '' for department-scoped actions such as faculty
   * overrides — those carry the department in before/afterJson instead.
   */
  boardId: string;
  beforeJson: string;
  afterJson: string;
}

export interface SaveFacultyOverrideInput {
  department: string;
  email: string;
  name: string;
  campus: string;
  action: FacultyOverrideAction;
}

export interface BoardRepo {
  // ── reads ──────────────────────────────────────────────────────────
  findUserAccess(email: string): Promise<SessionUser | null>;

  /** Scoped to what the user may see: admins get everything. */
  listBoards(user: SessionUser): Promise<BoardSummary[]>;
  countByStatus(user: SessionUser): Promise<DashboardCounts>;
  getBoard(boardId: string): Promise<BoardDetail | null>;

  /**
   * What a HoD may nominate: the department's Faculty rows minus exclusions,
   * plus admin-added members. Overrides are applied here — never in the UI —
   * so a crafted request cannot nominate an excluded faculty member.
   */
  listFaculty(department: string): Promise<FacultyMember[]>;

  /** The unfiltered Faculty rows, for the admin overrides screen only. */
  listBaseFaculty(department: string): Promise<FacultyMember[]>;
  listFacultyOverrides(department: string): Promise<FacultyOverride[]>;

  /** Every department with faculty — populates the overrides screen selector. */
  listDepartments(): Promise<string[]>;

  /**
   * Best-effort campus lookup across all departments, so the admin does not
   * retype it when adding faculty who already appear elsewhere.
   */
  findCampus(query: { name?: string; email?: string }): Promise<string | null>;

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

  /**
   * Upsert by (department, email): re-saving the same person replaces their
   * override rather than stacking a second row.
   */
  saveFacultyOverride(
    input: SaveFacultyOverrideInput,
    actor: SessionUser,
  ): Promise<FacultyOverride>;

  /** Idempotent — removing an override that is already gone is not an error. */
  deleteFacultyOverride(
    department: string,
    email: string,
    actor: SessionUser,
  ): Promise<void>;

  /** Append-only audit trail — never overwrite (docs §11 item 5). */
  appendAuditLog(entry: AuditEntry): Promise<void>;
}
