/**
 * The ONLY module that knows files live in Google Drive.
 * Backs the Pre/Post-QPSB check matrices and the ZIP download.
 */
import type { CheckResult, FolderCheck } from '@shared/types';
import type { CheckType } from '@shared/constants/folder-spec';

export interface DriveRepo {
  /** Children of a folder, one files.list call with a tight `fields` mask. */
  listChildren(folderId: string): Promise<DriveFile[]>;

  /** Fans out across every course in the board, capped concurrency. */
  runCheck(boardId: string, type: CheckType): Promise<CheckResult>;

  /**
   * Store-only streamed ZIP (docs §9). Never buffer the archive in memory —
   * a Worker has ~128 MB and the old base64 approach cannot be ported.
   */
  streamArchive(boardId: string): Promise<ReadableStream<Uint8Array>>;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  webViewLink?: string;
}

export const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Fields mask — request only what the matrix renders. */
export const LIST_FIELDS = 'files(id,name,mimeType,size,webViewLink),nextPageToken';

export function buildChildrenQuery(folderId: string): string {
  return `'${folderId}' in parents and trashed = false`;
}

export const MISSING: FolderCheck = {
  status: 'missing',
  fileCount: 0,
  folderUrl: null,
};

// TODO Phase 4 (checks) and Phase 5 (archive).
export function createDriveRepo(_accessToken: string): DriveRepo {
  throw new Error('createDriveRepo not implemented');
}
