/**
 * The ONLY module that knows the data lives in Google Sheets.
 *
 * Everything above this layer speaks in domain types. If Sheets is ever
 * replaced (or fronted by a D1 read model — docs §14), this file changes
 * and nothing else does.
 *
 * Tab layout is documented in docs/ARCHITECTURE.md §4.
 */
import type {
  BoardDetail,
  BoardSummary,
  Course,
  FacultyMember,
  SessionUser,
} from '@shared/types';

export const TABS = {
  access: 'Access',
  programmes: 'Programmes',
  courses: 'Courses',
  faculty: 'Faculty',
  boards: 'Boards',
  boardMembers: 'BoardMembers',
  boardDates: 'BoardDates',
  auditLog: 'AuditLog',
} as const;

/** KV cache TTLs, in seconds. Catalogue is near-static; boards are hot. */
export const CACHE_TTL = {
  catalogue: 15 * 60,
  boards: 30,
} as const;

export interface SheetsRepo {
  /** Resolves a Google account to a role + owned departments. */
  findUserAccess(email: string): Promise<SessionUser | null>;

  listBoards(user: SessionUser): Promise<BoardSummary[]>;
  getBoard(boardId: string): Promise<BoardDetail | null>;

  listFaculty(department: string): Promise<FacultyMember[]>;
  listCourses(boardId: string): Promise<Course[]>;

  /** Append-only. Never overwrite — this is the audit trail (§11 item 5). */
  appendAuditLog(entry: AuditEntry): Promise<void>;
}

export interface AuditEntry {
  timestamp: string;
  actorEmail: string;
  action: string;
  boardId: string;
  beforeJson: string;
  afterJson: string;
}

// TODO Phase 2: implement against sheets.googleapis.com/v4.
//   - Pull every tab in ONE spreadsheets.values.batchGet, not seven calls.
//   - Wrap reads in KV with the TTLs above; bust on write.
//   - Quotas to respect: 300 reads/min/project, 60/min/user.
export function createSheetsRepo(
  _spreadsheetId: string,
  _accessToken: string,
  _kv: KVNamespace,
): SheetsRepo {
  throw new Error('createSheetsRepo not implemented');
}
