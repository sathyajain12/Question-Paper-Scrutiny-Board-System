/**
 * Session + authorisation middleware (docs/ARCHITECTURE.md §6).
 *
 * Rule that must never be broken: authority is derived from the session,
 * never from the request body. Clients send a boardId; the server resolves
 * the department itself. The old portal passed department/degree as strings
 * from the client, which let any HoD act on another department's board.
 */
import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import type { Env } from '../env';
import type { Role } from '@shared/types';
import { getRepo } from '../repositories';
import { SESSION_COOKIE, readSessionToken } from '../auth/session';

export { SESSION_COOKIE };

/**
 * Verifies the session cookie and populates `c.var.user`.
 *
 * There is deliberately no bypass here. An earlier version let `?as=<email>`
 * assume any identity when DEV_MODE was on, which meant a single misconfigured
 * variable turned the deployment into an open admin console. One code path
 * now, on every environment: no cookie, no session.
 */
export const requireSession = createMiddleware<Env>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: 'Not signed in' }, 401);

  const user = await readSessionToken(token, c.env.SESSION_SIGNING_KEY);
  if (!user) {
    // Expired, tampered with, or signed by a key that has since rotated —
    // all the same to the caller, who needs to sign in again either way.
    return c.json({ error: 'Your session has expired. Please sign in again.' }, 401);
  }

  c.set('user', user);
  await next();
});

/** Gate an endpoint to specific roles. */
export function requireRole(...roles: Role[]) {
  return createMiddleware<Env>(async (c, next) => {
    const user = c.get('user');
    if (!roles.includes(user.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }
    await next();
  });
}

/**
 * Gate an endpoint to boards the user owns. Admins and viewers pass through;
 * a HoD must own the board's department.
 */
export const requireBoardAccess = createMiddleware<Env>(async (c, next) => {
  const user = c.get('user');
  const boardId = c.req.param('boardId') ?? c.req.query('boardId');
  if (!boardId) return c.json({ error: 'boardId is required' }, 400);

  const repo = await getRepo(c.env);
  const board = await repo.getBoard(boardId);
  if (!board) return c.json({ error: 'Board not found' }, 404);

  if (user.role === 'hod' && !user.departments.includes(board.department)) {
    // Deliberately 404, not 403: don't confirm the board exists.
    return c.json({ error: 'Board not found' }, 404);
  }

  await next();
});
