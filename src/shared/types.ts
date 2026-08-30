/**
 * Types shared by the React client and the Cloudflare Worker.
 * Keep this file free of any runtime imports so both bundles stay small.
 */

export type Role = 'admin' | 'hod' | 'viewer';

export type BoardStatus =
  | 'NotSubmitted'
  | 'Submitted'
  | 'Approved'
  | 'Rejected'
  | 'Locked';

export interface SessionUser {
  email: string;
  name: string;
  role: Role;
  /** Departments this user may act on. Empty for admin (implicitly all). */
  departments: string[];
}

export interface FacultyMember {
  email: string;
  name: string;
  campus: string;
  department: string;
}

/**
 * An admin adjustment to the faculty list a HoD picks from, scoped to one
 * department. `exclude` hides a Faculty-tab row (visiting staff, ward
 * conflicts); `add` surfaces someone who has no Faculty-tab row at all.
 */
export type FacultyOverrideAction = 'exclude' | 'add';

export interface FacultyOverride {
  department: string;
  /** Lower-cased — the identity of an override within a department. */
  email: string;
  name: string;
  campus: string;
  action: FacultyOverrideAction;
  /** Why the override was made — visiting staff, ward conflict, etc. Optional. */
  reason: string | null;
  createdBy: string;
  createdAt: string;
}

/**
 * One row of a department's override history — includes overrides that were
 * later removed, which is the whole point: the Overrides table only ever
 * shows what's *currently* in force.
 */
export interface FacultyAuditRow {
  timestamp: string;
  actorEmail: string;
  changeType: 'added' | 'removed';
  overrideAction: FacultyOverrideAction;
  name: string;
  email: string;
  campus: string;
  reason: string | null;
}

/** A board this faculty member currently appears on as a nominated member. */
export interface ActiveNomination {
  boardId: string;
  programme: string;
  status: BoardStatus;
}

export interface Course {
  courseCode: string;
  courseTitle: string;
  semester: string;
  driveFolderId: string;
}

export interface BoardDate {
  /** ISO yyyy-mm-dd. Formatting to dd-mm-yyyy is a presentation concern. */
  date: string;
  isSelected: boolean;
}

export interface BoardSummary {
  boardId: string;
  degree: string;
  degreeShort: string;
  department: string;
  programme: string;
  status: BoardStatus;
  courseCount: number;
  submittedBy: string | null;
  submittedAt: string | null;
  /** Optimistic-concurrency token — echo back on every mutation. See §7. */
  version: number;
}

export interface BoardDetail extends BoardSummary {
  chairperson: FacultyMember | null;
  members: FacultyMember[];
  courses: Course[];
  availableDates: BoardDate[];
  /** Single start time applied to all selected dates, e.g. "9:30 AM". */
  sessionTime: string | null;
  actionBy: string | null;
  actionAt: string | null;
  rejectionReason: string | null;
  /** Set when the admin flags the post-QPSB files for correction; cleared when the HoD acknowledges the fix. */
  changesRequested: boolean;
  /** Set once the admin closes the board after the QPSB session — revokes Drive access. Irreversible. */
  closed: boolean;
}

export interface DashboardCounts {
  total: number;
  notSubmitted: number;
  submitted: number;
  approved: number;
  rejected: number;
  locked: number;
}

/** One cell of the Pre/Post-QPSB check matrix. */
export interface FolderCheck {
  status: 'found' | 'missing' | 'folderNotFound';
  fileCount: number;
  folderUrl: string | null;
}

export interface CourseCheckRow {
  courseCode: string;
  courseTitle: string;
  /** Keyed by the folder keys in shared/constants/folder-spec.ts */
  folders: Record<string, FolderCheck>;
}

export interface CheckResult {
  boardId: string;
  folderName: string;
  folderUrl: string;
  rows: CourseCheckRow[];
}
