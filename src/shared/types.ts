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
