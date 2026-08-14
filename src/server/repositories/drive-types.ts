/** The Drive contract, kept separate so mock and live share one interface. */
import type { CheckResult } from '@shared/types';
import type { CheckType } from '@shared/constants/folder-spec';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  webViewLink?: string;
}

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
