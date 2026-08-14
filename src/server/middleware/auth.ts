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

export const SESSION_COOKIE = 'qpsb_session';

/** Development only — lets you switch role without a Google login. */
export const DEV_USER_COOKIE = 'qpsb_dev_user';
const DEFAULT_DEV_USER = 'hod.cs@sssihl.edu.in';

/** Verifies the session and populates c.var.user. */
export const requireSession = createMiddleware<Env>(async (c, next) => {
  if (c.env.DEV_MODE === 'true') {
    // Impersonation is gated on DEV_MODE, which is never set in production.
    const email =
      c.req.query('as') ?? getCookie(c, DEV_USER_COOKIE) ?? DEFAULT_DEV_USER;

    const repo = await getRepo(c.env);
    const user = await repo.findUserAccess(email);
    if (!user) return c.json({ error: `Unknown dev user: ${email}` }, 401);

    c.set('user', user);
    return next();
  }

  // TODO Phase 1:
  //   1. read SESSION_COOKIE
  //   2. jwtVerify against SESSION_SIGNING_KEY (jose)
  //   3. c.set('user', payload) or 401
  return c.json({ error: 'Not signed in' }, 401);
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
