/**
 * Streamed ZIP of a board's QPSB folder (docs/ARCHITECTURE.md §9).
 *
 * Deliberately NOT the old base64-in-memory approach: a Worker has ~128 MB
 * and a CPU ceiling. Store-only (no compression) keeps CPU near zero, which
 * costs nothing since PDFs and DOCX are already compressed.
 *
 * This is the highest-risk item in the plan — prototype in Phase 0.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { requireBoardAccess } from '../middleware/auth';

const downloads = new Hono<Env>();

downloads.get('/qpsb', requireBoardAccess, (c) => {
  void c;
  // TODO Phase 5: fflate streaming zip, Drive fetches capped at ~3 concurrent,
  // piped into a ReadableStream response with
  //   Content-Type: application/zip
  //   Content-Disposition: attachment; filename="<board>.zip"
  throw new Error('archive download not implemented');
});

export default downloads;
