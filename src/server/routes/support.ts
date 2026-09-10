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

  const identity: SupportSocketUser = {
    email: user.email,
    name: user.name,
    role: user.role,
    departments: user.departments,
  };

  const headers = new Headers(c.req.raw.headers);
  headers.set(SUPPORT_USER_HEADER, JSON.stringify(identity));

  const stub = c.env.SUPPORT_CHAT.get(c.env.SUPPORT_CHAT.idFromName(SUPPORT_DESK_ID));

  // Cloning with `new Request(original, { headers })` preserves the upgrade,
  // which a hand-built Request would drop.
  return stub.fetch(new Request(c.req.raw, { headers }));
});

export default support;
