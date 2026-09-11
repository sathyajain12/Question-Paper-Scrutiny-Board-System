/**
 * Types shared by the React client and the Cloudflare Worker.
 * Keep this file free of any runtime imports so both bundles stay small.
 */
import type { SUPPORT_CATEGORIES } from './constants/support';

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
  /**
   * Carried on the list so the admin table and action queue can render a
   * whole page from one request. Without these the admin screen fetched
   * every board's detail individually — one request per row.
   */
  members: FacultyMember[];
  availableDates: BoardDate[];
  sessionTime: string | null;
  /** Set when the admin flags the post-QPSB files for correction. */
  changesRequested: boolean;
  /** Set once the admin closes the board after the session. Irreversible. */
  closed: boolean;
  /** Optimistic-concurrency token — echo back on every mutation. See §7. */
  version: number;
}

export interface BoardDetail extends BoardSummary {
  chairperson: FacultyMember | null;
  courses: Course[];
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

// ── Support desk ─────────────────────────────────────────────────────
// Live HoD ↔ administrator chat, for the case the FAQ does not cover.
// One conversation per HoD, identified by their lower-cased email — a HoD
// has one running thread with the office, not one per board, because the
// questions that reach a person are rarely about a single board.

export type SupportConversationStatus = 'open' | 'resolved';

/**
 * An image attached to a message. The bytes live under their own storage key
 * and are fetched on demand — a transcript of 200 messages must not drag
 * every picture ever sent along with it.
 */
export interface SupportImage {
  id: string;
  width: number;
  height: number;
}

export interface SupportMessage {
  id: string;
  conversationId: string;
  authorEmail: string;
  authorName: string;
  authorRole: Role;
  text: string;
  image?: SupportImage;
  /** ISO timestamp, set by the server — never trust a client clock. */
  sentAt: string;
}

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export interface SupportConversation {
  /**
   * Opaque and per-thread — deliberately **not** the HoD's email any more.
   *
   * Keying by email gave each HoD exactly one thread, so two unrelated
   * problems (a wrong faculty list and a failing upload) interleaved in one
   * transcript that could only be resolved as a whole. This is the one place
   * the chat model genuinely broke down, and an id per thread is the fix.
   */
  conversationId: string;
  /** Short, quotable on the phone: QPSB-104. */
  reference: string;
  /** Taken from the opening message — a title without asking for one. */
  subject: string;
  /** Set by the administrator when resolving. Drives the themes report. */
  category: SupportCategory | null;
  resolvedAt: string | null;
  hodEmail: string;
  hodName: string;
  departments: string[];
  status: SupportConversationStatus;
  createdAt: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  /** Messages from the HoD no administrator has opened yet. */
  unreadForAdmin: number;
  /** Replies from an administrator this HoD has not seen yet. */
  unreadForHod: number;

  /**
   * Receipt watermarks, as ISO timestamps.
   *
   * Rather than a flag per message — which would mean rewriting a whole
   * transcript every time someone opens it — each side records how far it has
   * got. A message counts as delivered when the *recipient's* `DeliveredAt`
   * is at or past its `sentAt`, and read when their `ReadAt` is. Both only
   * move forward, so the comparison is stable.
   */
  hodDeliveredAt: string | null;
  hodReadAt: string | null;
  adminDeliveredAt: string | null;
  adminReadAt: string | null;

  /**
   * The board this thread is about, if the HoD named one.
   *
   * Nearly every conversation starts with the office asking "which
   * programme?" — the portal already knows the HoD's boards, so it can carry
   * the answer instead. The programme is stored alongside the id so the admin
   * screen can label the thread without a second lookup.
   */
  boardId: string | null;
  boardProgramme: string | null;

  /**
   * When the office should be emailed if this is still unanswered. Set when a
   * HoD writes with no administrator connected; cleared once one reads it.
   */
  notifyDueAt: string | null;
  /** Last time an email actually went out, for the cooldown. */
  notifiedAt: string | null;
}

/** A board a HoD may attach to their thread — resolved server-side at connect. */
export interface SupportBoardOption {
  boardId: string;
  programme: string;
}

/** What the sender's ticks show. */
export type SupportReceipt = 'sent' | 'delivered' | 'read';

/**
 * Derived from live socket connections, not from a heartbeat table — an
 * administrator counts as online exactly while a browser tab of theirs is
 * connected to the desk.
 */
export interface SupportPresence {
  adminsOnline: number;
  adminNames: string[];
}

/** Server → client frames. The client never invents these. */
export type SupportServerFrame =
  | {
      type: 'init';
      presence: SupportPresence;
      /**
       * Every thread the viewer may see, newest activity first — all of them
       * for an administrator, only their own for a HoD. Transcripts are
       * fetched per thread on open rather than shipped with the list.
       */
      conversations: SupportConversation[];
      /** Present for a HoD: the boards they may attach to a thread. */
      boards?: SupportBoardOption[];
    }
  /** A thread was deleted by an administrator; drop it everywhere. */
  | { type: 'deleted'; conversationId: string }
  | { type: 'presence'; presence: SupportPresence }
  | { type: 'message'; message: SupportMessage; conversation: SupportConversation }
  | { type: 'conversation'; conversation: SupportConversation }
  | { type: 'history'; conversationId: string; messages: SupportMessage[] }
  /** Image bytes, answered on demand. `dataUrl` is null if it has been pruned. */
  | { type: 'image'; imageId: string; dataUrl: string | null }
  | {
      type: 'typing';
      conversationId: string;
      authorName: string;
      authorRole: Role;
    }
  | { type: 'error'; message: string };

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
