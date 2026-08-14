/**
 * The live Google Sheets implementation of BoardRepo — the ONLY module that
 * knows the data lives in Sheets. Tab layout is documented in
 * docs/ARCHITECTURE.md §4.
 *
 * Not yet implemented (Phase 2). Development runs on createMockRepo().
 */
import type { BoardRepo } from './types';

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

// TODO Phase 2: implement against sheets.googleapis.com/v4.
//   - Pull every tab in ONE spreadsheets.values.batchGet, not seven calls.
//   - Wrap reads in KV with the TTLs above; bust on write.
//   - Route every write through the BoardLock Durable Object.
//   - Quotas to respect: 300 reads/min/project, 60/min/user.
export function createSheetsRepo(
  _spreadsheetId: string,
  _accessToken: string,
  _kv: KVNamespace,
): BoardRepo {
  throw new Error('createSheetsRepo not implemented — Phase 2');
}
