/**
 * Pre/Post-QPSB file checks (docs/ARCHITECTURE.md §9).
 *
 * requireBoardAccess already resolves ?boardId= and 404s anything outside the
 * user's departments, so a HoD cannot check another department's programme.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { requireBoardAccess } from '../middleware/auth';
import { getDriveRepo } from '../repositories';

const checks = new Hono<Env>();

/**
 * The pre-QPSB check is an office activity — it inspects material the board
 * has not yet scrutinised, so HoDs see the post check only. This mirrors the
 * old portal, which hid the toggle from HoDs; here it is actually enforced.
 */
checks.get('/pre', requireBoardAccess, async (c) => {
  if (c.get('user').role === 'hod') {
    return c.json({ error: 'The pre-QPSB check is restricted to the office.' }, 403);
  }

  const drive = await getDriveRepo(c.env);
  return c.json(await drive.runCheck(c.req.query('boardId')!, 'pre'));
});

checks.get('/post', requireBoardAccess, async (c) => {
  const drive = await getDriveRepo(c.env);
  return c.json(await drive.runCheck(c.req.query('boardId')!, 'post'));
});

export default checks;
