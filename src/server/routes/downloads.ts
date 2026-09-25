/**
 * Streamed ZIP of a board's QPSB folder (docs/ARCHITECTURE.md §9).
 *
 * Deliberately NOT the old base64-in-memory approach: a Worker has ~128 MB
 * and a CPU ceiling. Store-only (no compression) keeps CPU near zero, which
 * costs nothing since PDFs and DOCX are already compressed. See lib/zip.ts.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { requireBoardAccess, requireRole } from '../middleware/auth';
import { getDriveRepo, getRepo } from '../repositories';
import { safeFilename } from '../lib/zip';

const downloads = new Hono<Env>();

/**
 * Admin-only, and only once the board is closed.
 *
 * Both halves matter. Closing a board revokes everyone's Drive access and
 * asks the members to destroy their local copies — so handing a HoD a
 * download afterwards would undo the very thing closing is for. The office
 * still needs the papers for its records, which is what this serves.
 *
 * Before closing there is nothing to archive that the board members cannot
 * already open in Drive.
 */
downloads.get('/qpsb', requireRole('admin'), requireBoardAccess, async (c) => {
  const boardId = c.req.query('boardId')!;

  const repo = await getRepo(c.env);
  const board = await repo.getBoard(boardId);
  if (!board) return c.json({ error: 'Board not found' }, 404);

  if (!board.closed) {
    return c.json(
      {
        error:
          'The archive is available once the board is closed. Close it first, which also revokes Drive access.',
      },
      409,
    );
  }

  const drive = await getDriveRepo(c.env);
  const archive = await drive.streamArchive(boardId);

  await repo.appendAuditLog({
    timestamp: new Date().toISOString(),
    actorEmail: c.get('user').email,
    action: 'download_archive',
    boardId,
    beforeJson: '{}',
    afterJson: JSON.stringify({ programme: board.programme }),
  });

  const filename = safeFilename(`${board.programme} QPSB`);

  return new Response(archive, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}.zip"`,
      // The length is unknown until the last byte, so the browser shows an
      // indeterminate progress bar rather than a wrong one.
      'Cache-Control': 'no-store',
    },
  });
});

export default downloads;
