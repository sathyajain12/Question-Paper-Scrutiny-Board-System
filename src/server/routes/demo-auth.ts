/**
 * Demo sign-in — fixtures only, key-gated, temporary.
 *
 * This exists so the portal can be walked through before the Google OAuth
 * client is configured. It is the one path to a session that does not go via
 * Google, so it carries three locks, all of which must hold:
 *
 *   1. it is mounted only when DATA_SOURCE is fixtures, so pointing the
 *      deployment at the real workbook removes it without anyone
 *      remembering to;
 *   2. it 404s unless DEMO_ACCESS_KEY is set and matches, so knowing the
 *      URL is not enough; and
 *   3. it will only impersonate an address already in the fixture access
 *      list — never an arbitrary one, which is what made the old `?as=`
 *      parameter dangerous.
 *
 * Delete this file and its mount in index.ts once real sign-in works. It is
 * deliberately one file with no imports from the rest of the auth code, so
 * removing it cannot break anything else.
 */
import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import type { Env } from '../env';
import { usingFixtures } from '../repositories';
import { FIXTURE_ACCESS } from '../repositories/fixtures';
import {
  SESSION_COOKIE,
  issueSessionToken,
  sessionCookieOptions,
} from '../auth/session';
import type { SessionUser } from '@shared/types';

const demo = new Hono<Env>();

/**
 * All three locks in one place, so no mount-order mistake can open a hole:
 * fixtures only, key configured, key correct.
 */
function unlocked(c: {
  env: Env['Bindings'];
  req: { query: (k: string) => string | undefined };
}) {
  if (!usingFixtures(c.env)) return false;

  const expected = (c.env.DEMO_ACCESS_KEY ?? '').trim();
  if (!expected) return false;

  return c.req.query('key') === expected;
}

/** Who can be borrowed, straight from the fixtures. */
function demoUsers(): SessionUser[] {
  return FIXTURE_ACCESS.map((row) => ({
    email: row.email,
    name: row.name,
    role: row.role,
    departments: [...row.departments],
  }));
}

demo.get('/', (c) => {
  if (!unlocked(c)) return c.json({ error: 'Not found' }, 404);

  c.header('Cache-Control', 'no-store, must-revalidate');
  const key = c.req.query('key') ?? '';
  const cards = demoUsers()
    .map((user) => {
      const scope =
        user.role === 'admin'
          ? 'Admin portal, faculty overrides, support desk'
          : `Constitution and post-QPSB checks — ${user.departments.join(', ')}`;

      return `<li>
        <div>
          <strong>${user.name}</strong>
          <span class="role">${user.role}</span>
          <p>${scope}</p>
          <p class="email">${user.email}</p>
        </div>
        <a href="/api/auth/demo/as?key=${encodeURIComponent(key)}&email=${encodeURIComponent(user.email)}">Open portal</a>
      </li>`;
    })
    .join('');

  return c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>QPSB demo access</title>
<style>
  body{margin:0;padding:32px 20px;background:#eef2f7;color:#111d2b;
       font:16px/1.6 system-ui,sans-serif}
  .wrap{max-width:640px;margin:0 auto}
  h1{font-size:21px;margin:0 0 4px}
  .lede{margin:0 0 24px;color:#56687c;font-size:14.5px}
  ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
  li{background:#fff;border:1px solid #cbd6e3;border-radius:10px;padding:16px 18px;
     display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}
  li p{margin:4px 0 0;font-size:13.5px;color:#56687c}
  .email{font-family:ui-monospace,monospace;font-size:12px;color:#7c8da0}
  .role{display:inline-block;margin-left:8px;font-size:10.5px;letter-spacing:.08em;
        text-transform:uppercase;background:#dce8f6;color:#0c5196;padding:3px 8px;border-radius:999px}
  a{background:#0c5196;color:#fff;text-decoration:none;padding:9px 18px;
    border-radius:6px;font-size:14px;font-weight:600;white-space:nowrap}
  .note{margin-top:24px;padding:14px 16px;background:#faeed6;border-left:3px solid #8a5300;
        border-radius:0 8px 8px 0;font-size:13.5px;color:#5c3d0a}
</style></head><body><div class="wrap">
<h1>QPSB demo access</h1>
<p class="lede">Sample data. Nothing here is a real board, and no email is sent.</p>
<ul>${cards}</ul>
<p class="note">Temporary: this page exists only while the portal runs on sample
data. It disappears once the real workbook is connected, and real sign-in is
through your institute Google account.</p>
</div></body></html>`);
});

demo.get('/as', async (c) => {
  if (!unlocked(c)) return c.json({ error: 'Not found' }, 404);

  const email = (c.req.query('email') ?? '').toLowerCase();
  const user = demoUsers().find((u) => u.email.toLowerCase() === email);

  if (!user) {
    return c.json({ error: 'That address is not in the demo access list.' }, 400);
  }

  const token = await issueSessionToken(user, c.env.SESSION_SIGNING_KEY);
  setCookie(
    c,
    SESSION_COOKIE,
    token,
    sessionCookieOptions(new URL(c.req.url).protocol === 'https:'),
  );

  // A cached redirect is a redirect that never sets the cookie again. Browsers
  // will happily reuse a 302 for a URL they have seen, which leaves the person
  // looking at a signed-out page at a sign-in URL.
  c.header('Cache-Control', 'no-store, must-revalidate');

  console.log(`[Demo] Session issued for ${user.email} (${user.role}).`);

  // Straight to where this role actually lands, rather than via "/" and a
  // client-side hop — one fewer place for a stale page to be served from.
  return c.redirect(user.role === 'admin' ? '/admin' : '/constitution');
});

export default demo;
