/**
 * Support desk socket.
 *
 * The only job here is authentication: `requireSession` has already run (it
 * is mounted on `/api/*`), so this route knows who is connecting and stamps
 * that identity onto the request before forwarding it to the Durable Object.
 * The DO trusts the header precisely because it is unreachable from outside
 * this Worker — a browser cannot address a DO directly.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { getRepo } from '../repositories';
import {
  SUPPORT_DESK_ID,
  SUPPORT_USER_HEADER,
  type SupportSocketUser,
} from '../durable-objects/support-chat';

const support = new Hono<Env>();

support.get('/ws', async (c) => {
  if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') {
    return c.json({ error: 'Expected a WebSocket upgrade.' }, 426);
  }

  const user = c.get('user');

  // Viewers are read-only auditors; there is nothing for them to raise.
  if (user.role !== 'admin' && user.role !== 'hod') {
    return c.json({ error: 'The support desk is for HoDs and administrators.' }, 403);
  }

  // The Durable Object has no repository, so it cannot check that a board a
  // HoD names is actually theirs. Resolving the list here — from the session,
  // through the same role-scoped `listBoards` the rest of the app uses — is
  // what gives the object something trustworthy to validate against.
  const boards =
    user.role === 'hod'
      ? (await (await getRepo(c.env)).listBoards(user)).map((b) => ({
          boardId: b.boardId,
          programme: b.programme,
        }))
      : undefined;

  const identity: SupportSocketUser = {
    email: user.email,
    name: user.name,
    role: user.role,
    departments: user.departments,
    ...(boards ? { boards } : {}),
  };

  const headers = new Headers(c.req.raw.headers);
  headers.set(SUPPORT_USER_HEADER, JSON.stringify(identity));

  const stub = c.env.SUPPORT_CHAT.get(c.env.SUPPORT_CHAT.idFromName(SUPPORT_DESK_ID));

  // Cloning with `new Request(original, { headers })` preserves the upgrade,
  // which a hand-built Request would drop.
  return stub.fetch(new Request(c.req.raw, { headers }));
});

export default support;
