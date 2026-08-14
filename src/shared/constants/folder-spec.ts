/**
 * Drive folder conventions, in one place.
 *
 * These names were magic strings scattered through the old HTML, and the UI
 * label drifted from the folder name in at least one case ("Scrutinized
 * Synopsis" was rendered for the folder actually named "Final Synopsis").
 * Verify each `folderName` against real Drive folders before Phase 4.
 */

export interface FolderSpec {
  /** Stable key used in API payloads and as the React column key. */
  key: string;
  /** Exact folder name in Google Drive. */
  folderName: string;
  /** Column heading shown to users. */
  label: string;
  /**
   * Informational folders are counted but never marked missing;
   * required folders drive the red/green status.
   */
  required: boolean;
}

/** Tab 2 — Pre-QPSB check. */
export const PRE_QPSB_FOLDERS: FolderSpec[] = [
  { key: 'syllabus', folderName: '1) Syllabus', label: 'Syllabus', required: false },
  { key: 'qpPattern', folderName: '2) QP - Pattern', label: 'QP Pattern', required: false },
  { key: 'modelQp', folderName: '3) Model QP', label: 'Model QP', required: false },
  { key: 'rawQp', folderName: '4) Raw QP', label: 'Raw QP', required: true },
  { key: 'rawSynopsis', folderName: '5) Raw Synopsis', label: 'Raw Synopsis', required: true },
  { key: 'formattedQp', folderName: '6) Formatted QP', label: 'Formatted QP', required: true },
];

/** Tab 2 — Post-QPSB check. All four are required. */
export const POST_QPSB_FOLDERS: FolderSpec[] = [
  { key: 'wordTrack', folderName: 'Word Track', label: 'Word Track', required: true },
  { key: 'finalSynopsis', folderName: 'Final Synopsis', label: 'Scrutinised Synopsis', required: true },
  { key: 'wordMaster', folderName: 'Word Master', label: 'Word Master', required: true },
  { key: 'pdfMaster', folderName: 'PDF Master', label: 'PDF Master', required: true },
];

export type CheckType = 'pre' | 'post';

export function foldersFor(type: CheckType): FolderSpec[] {
  return type === 'pre' ? PRE_QPSB_FOLDERS : POST_QPSB_FOLDERS;
}

/** Max concurrent Drive requests when fanning out across courses (§9). */
export const DRIVE_FANOUT_CONCURRENCY = 8;
