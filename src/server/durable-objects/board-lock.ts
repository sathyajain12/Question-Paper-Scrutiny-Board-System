/**
 * BoardLock — one Durable Object instance per boardId.
 *
 * Google Sheets has no transactions. Without this, two admins working the
 * approval queue can both read `status=Submitted`, one approves, one rejects,
 * and the second write silently wins. The runtime guarantees a DO instance
 * processes one request at a time, which gives us the serialisation Sheets
 * cannot. See docs/ARCHITECTURE.md §7.
 *
 * Reads never come here — they hit the KV cache — so this costs nothing on
 * the hot path.
 */
import type { BoardAction } from '@shared/domain/board-state';

export interface MutateRequest {
  action: BoardAction;
  actorEmail: string;
  /** Version the client believed it was editing. */
  expectedVersion: number;
  payload: unknown;
}

export class BoardLock implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: unknown,
  ) {}

  async fetch(_request: Request): Promise<Response> {
    // TODO Phase 3 — the critical section:
    //   1. read the current board row from Sheets
    //   2. if row.version !== expectedVersion → 409 VERSION_CONFLICT
    //   3. assertTransition(action, row.status, actorRole)
    //   4. write the row + BoardMembers/BoardDates changes
    //   5. append to AuditLog
    //   6. increment version, bust the KV cache key for this board
    void this.state;
    void this.env;
    return new Response('BoardLock not implemented', { status: 501 });
  }
}
