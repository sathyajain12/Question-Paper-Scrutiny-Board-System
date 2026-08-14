/**
 * Pre/Post-QPSB file checks (docs/ARCHITECTURE.md §9).
 * HoDs may only run the post check, and only on their own boards.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { requireBoardAccess } from '../middleware/auth';

const checks = new Hono<Env>();

checks.get('/pre', requireBoardAccess, (c) => {
  void c;
  throw new Error('pre-check not implemented'); // Phase 4
});

checks.get('/post', requireBoardAccess, (c) => {
  void c;
  throw new Error('post-check not implemented'); // Phase 4
});

export default checks;
