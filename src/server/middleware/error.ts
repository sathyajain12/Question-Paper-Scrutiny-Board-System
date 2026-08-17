import type { ErrorHandler } from 'hono';
import { ZodError } from 'zod';
import { TransitionError } from '@shared/domain/board-state';
import type { Env } from '../env';

/** Maps domain errors onto HTTP status codes the client knows how to render. */
export const errorHandler: ErrorHandler<Env> = (err, c) => {
  if (err instanceof ZodError) {
    return c.json(
      { error: 'Validation failed', issues: err.issues },
      400,
    );
  }

  if (err instanceof TransitionError) {
    // INVALID_STATE usually means someone else moved the board first —
    // the client should refetch and tell the user.
    return c.json(
      { error: err.message, code: err.code },
      err.code === 'FORBIDDEN_ROLE' ? 403 : 409,
    );
  }

  if (err instanceof ConflictError) {
    return c.json({ error: err.message, code: 'CONFLICT' }, 409);
  }

  if (err instanceof VersionConflictError) {
    return c.json(
      { error: 'This board was updated by someone else.', code: 'VERSION_CONFLICT' },
      409,
    );
  }

  console.error('Unhandled error', err);
  return c.json({ error: 'Internal server error' }, 500);
};

/**
 * A request that is well-formed but conflicts with the current data — e.g.
 * adding a faculty member who already has a Faculty row for that department.
 * Carries a message meant for the user, unlike the generic 500 path.
 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/** Thrown by BoardLock when the client's `version` is stale (§7). */
export class VersionConflictError extends Error {
  constructor() {
    super('Version conflict');
    this.name = 'VersionConflictError';
  }
}
