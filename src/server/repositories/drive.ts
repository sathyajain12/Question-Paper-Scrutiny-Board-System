/**
 * The live Google Drive implementation — the ONLY module that knows files
 * live in Drive. Backs the Pre/Post-QPSB check matrices and the ZIP download.
 *
 * Not yet implemented (Phase 4/5). Development runs on createMockDriveRepo().
 */
import type { DriveRepo } from './drive-types';

export type { DriveFile, DriveRepo } from './drive-types';

export const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Fields mask — request only what the matrix renders. */
export const LIST_FIELDS = 'files(id,name,mimeType,size,webViewLink),nextPageToken';

export function buildChildrenQuery(folderId: string): string {
  return `'${folderId}' in parents and trashed = false`;
}

// TODO Phase 4 (checks) and Phase 5 (archive).
export function createDriveRepo(_accessToken: string): DriveRepo {
  throw new Error('createDriveRepo not implemented — Phase 4');
}
