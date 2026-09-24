/**
 * The live Google Sheets implementation of BoardRepo — the ONLY module that
 * knows the data lives in Sheets. Tab layout is documented in
 * docs/ARCHITECTURE.md §4.
 *
 * Being built incrementally. `findUserAccess` is live, because sign-in cannot
 * work without it: the OAuth callback proves who someone is, and this decides
 * what they may do. Everything else still throws a named error rather than a
 * generic one, so a gap in the port reads as a gap and not as a bug.
 */
import type { BoardRepo } from './types';
import type { Role, SessionUser } from '@shared/types';
import { batchGet, readTab } from '../google/sheets-client';

export const TABS = {
  access: 'Access',
  programmes: 'Programmes',
  courses: 'Courses',
  faculty: 'Faculty',
  facultyOverrides: 'FacultyOverrides',
  boards: 'Boards',
  boardMembers: 'BoardMembers',
  boardDates: 'BoardDates',
  auditLog: 'AuditLog',
} as const;

/** KV cache TTLs, in seconds. Catalogue is near-static; boards are hot. */
export const CACHE_TTL = {
  /** The access list changes a few times a term. */
  access: 5 * 60,
  catalogue: 15 * 60,
  boards: 30,
} as const;

const ACCESS_CACHE_KEY = 'sheets:access';

function notYetImplemented(method: string): never {
  throw new Error(
    `${method} is not implemented against Google Sheets yet — see docs/ARCHITECTURE.md §12, Phase 2.`,
  );
}

function parseRole(value: string): Role | null {
  const role = value.trim().toLowerCase();
  return role === 'admin' || role === 'hod' || role === 'viewer' ? role : null;
}

interface AccessEntry {
  email: string;
  name: string;
  role: Role;
  departments: string[];
}

/**
 * Collapses the Access tab into one entry per person.
 *
 * The tab carries one row per department a HoD owns (§4 — deliberately not a
 * CSV cell), so a HoD with three departments appears three times and has to
 * be folded back together here.
 */
export function foldAccessRows(rows: string[][]): Record<string, AccessEntry> {
  const tab = readTab(rows);
  const byEmail: Record<string, AccessEntry> = {};

  for (const row of tab.rows) {
    const email = (row.email ?? '').trim().toLowerCase();
    if (!email) continue;

    const role = parseRole(row.role ?? '');
    if (!role) continue; // A row with no usable role grants nothing.

    let entry = byEmail[email];
    if (!entry) {
      entry = {
        email,
        // §4 defines no name column; support one if the sheet grew it, and
        // otherwise let the caller prefer Google's profile name.
        name: (row.name ?? '').trim() || email.split('@')[0] || email,
        role,
        departments: [],
      };
      byEmail[email] = entry;
    }

    const department = (row.department ?? '').trim();
    if (department && !entry.departments.includes(department)) {
      entry.departments.push(department);
    }
  }

  return byEmail;
}

export function createSheetsRepo(
  spreadsheetId: string,
  accessToken: string,
  kv: KVNamespace,
): BoardRepo {
  async function loadAccess(): Promise<Record<string, AccessEntry>> {
    const cached = await kv.get(ACCESS_CACHE_KEY, 'json');
    if (cached) return cached as Record<string, AccessEntry>;

    const ranges = await batchGet(spreadsheetId, accessToken, [TABS.access]);
    const folded = foldAccessRows(ranges[TABS.access] ?? []);

    await kv.put(ACCESS_CACHE_KEY, JSON.stringify(folded), {
      expirationTtl: CACHE_TTL.access,
    });

    return folded;
  }

  return {
    async findUserAccess(email: string): Promise<SessionUser | null> {
      const access = await loadAccess();
      const entry = access[email.trim().toLowerCase()];
      if (!entry) return null;

      return {
        email: entry.email,
        name: entry.name,
        role: entry.role,
        departments: [...entry.departments],
      };
    },

    // ── Phase 2 — reads ────────────────────────────────────────────
    listBoards: () => notYetImplemented('listBoards'),
    countByStatus: () => notYetImplemented('countByStatus'),
    getBoard: () => notYetImplemented('getBoard'),
    listFaculty: () => notYetImplemented('listFaculty'),
    listBaseFaculty: () => notYetImplemented('listBaseFaculty'),
    listFacultyOverrides: () => notYetImplemented('listFacultyOverrides'),
    listDepartments: () => notYetImplemented('listDepartments'),
    findCampus: () => notYetImplemented('findCampus'),
    findActiveNominations: () => notYetImplemented('findActiveNominations'),
    listFacultyAuditLog: () => notYetImplemented('listFacultyAuditLog'),

    // ── Phase 3 — writes ───────────────────────────────────────────
    submitConstitution: () => notYetImplemented('submitConstitution'),
    approve: () => notYetImplemented('approve'),
    reject: () => notYetImplemented('reject'),
    offerDates: () => notYetImplemented('offerDates'),
    confirmSchedule: () => notYetImplemented('confirmSchedule'),
    markFilesComplete: () => notYetImplemented('markFilesComplete'),
    requestChanges: () => notYetImplemented('requestChanges'),
    acknowledgeChanges: () => notYetImplemented('acknowledgeChanges'),
    closeBoard: () => notYetImplemented('closeBoard'),
    saveFacultyOverride: () => notYetImplemented('saveFacultyOverride'),
    deleteFacultyOverride: () => notYetImplemented('deleteFacultyOverride'),
    appendAuditLog: () => notYetImplemented('appendAuditLog'),
  };
}
