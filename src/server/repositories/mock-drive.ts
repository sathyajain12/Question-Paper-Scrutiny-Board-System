/**
 * In-memory DriveRepo for development.
 *
 * Results are derived deterministically from the course code, so a given
 * course always reports the same state across reloads — which makes the UI
 * predictable to work on, and means a screenshot stays true tomorrow.
 */
import type { CheckResult, CourseCheckRow, FolderCheck } from '@shared/types';
import { foldersFor, type CheckType } from '@shared/constants/folder-spec';
import type { DriveRepo } from './drive-types';
import { FIXTURE_BOARDS } from './fixtures';

/** Small stable hash so results don't shuffle between requests. */
function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function checkFor(courseCode: string, folderKey: string): FolderCheck {
  const seed = hash(`${courseCode}:${folderKey}`);

  // ~15% of required folders are missing and ~5% absent entirely, so the
  // matrix shows all three states rather than a wall of green.
  const roll = seed % 100;
  if (roll < 5) return { status: 'folderNotFound', fileCount: 0, folderUrl: null };
  if (roll < 20) return { status: 'missing', fileCount: 0, folderUrl: null };

  return {
    status: 'found',
    fileCount: 1 + (seed % 3),
    folderUrl: `https://drive.google.com/drive/folders/mock-${courseCode}-${folderKey}`,
  };
}

export function createMockDriveRepo(): DriveRepo {
  return {
    async listChildren() {
      return [];
    },

    async runCheck(boardId: string, type: CheckType): Promise<CheckResult> {
      const board = FIXTURE_BOARDS.find((b) => b.boardId === boardId);
      if (!board) throw new Error(`Board not found: ${boardId}`);

      const specs = foldersFor(type);

      const rows: CourseCheckRow[] = board.courses.map((course) => ({
        courseCode: course.courseCode,
        courseTitle: course.courseTitle,
        folders: Object.fromEntries(
          specs.map((spec) => [spec.key, checkFor(course.courseCode, spec.key)]),
        ),
      }));

      return {
        boardId,
        folderName: `${board.programme} — QPSB`,
        folderUrl: `https://drive.google.com/drive/folders/mock-${boardId}`,
        rows,
      };
    },

    async streamArchive(): Promise<ReadableStream<Uint8Array>> {
      throw new Error('Archive download not implemented — Phase 5');
    },
  };
}
