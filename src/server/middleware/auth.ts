/**
 * Session + authorisation middleware (docs/ARCHITECTURE.md §6).
 *
 * Rule that must never be broken: authority is derived from the session,
 * never from the request body. Clients send a boardId; the server resolves
 * the department itself. The old portal passed department/degree as strings
 * from the client, which let any HoD act on another department's board.
 */
import { createMiddleware } from 'hono/factory';
import type { Env } from '../env';
import type { Role } from '@shared/types';

export const SESSION_COOKIE = 'qpsb_session';

/** Verifies the signed session cookie and populates c.var.user. */
export const requireSession = createMiddleware<Env>(async (_c, _next) => {
  // TODO Phase 1:
  //   1. read SESSION_COOKIE
  //   2. jwtVerify against SESSION_SIGNING_KEY (jose)
  //   3. c.set('user', payload) or 401
  throw new Error('requireSession not implemented');
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
 * Gate an endpoint to boards the user owns.
 * Admins pass through; a HoD must own the board's department.
 */
export const requireBoardAccess = createMiddleware<Env>(async (_c, _next) => {
  // TODO Phase 2: look up board by :boardId, compare board.department
  // against user.departments, 403 on mismatch, then stash the board on
  // the context so the handler need not re-fetch it.
  throw new Error('requireBoardAccess not implemented');
});
