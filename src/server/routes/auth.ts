/**
 * Google OIDC, Authorization Code + PKCE (docs/ARCHITECTURE.md §6).
 * These routes are public — the login dance cannot require a session.
 *
 * The redirect URI is derived from the incoming request's own origin rather
 * than configured, so the same build works on localhost, a preview
 * deployment and production. Each of those origins must be registered on the
 * OAuth client; Google rejects anything that isn't, which is the intended
 * behaviour — an unregistered origin is exactly what an attacker would use.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from '../env';
import { getRepo } from '../repositories';
import {
  buildAuthorizationUrl,
  codeChallengeFor,
  exchangeCode,
  randomToken,
  verifyIdToken,
} from '../auth/google-oidc';
import {
  SESSION_COOKIE,
  issueSessionToken,
  sessionCookieOptions,
} from '../auth/session';

const auth = new Hono<Env>();

const STATE_COOKIE = 'qpsb_oauth_state';
const VERIFIER_COOKIE = 'qpsb_oauth_verifier';
const RETURN_COOKIE = 'qpsb_oauth_return';
/** The round trip to Google, generously: consent, account chooser, 2FA. */
const FLOW_TTL_SECONDS = 10 * 60;

function callbackUrl(requestUrl: string): string {
  return new URL('/api/auth/callback', requestUrl).toString();
}

function isSecure(requestUrl: string): boolean {
  return new URL(requestUrl).protocol === 'https:';
}

function transientCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'Lax' as const,
    path: '/',
    maxAge: FLOW_TTL_SECONDS,
  };
}

/**
 * Whether sign-in can actually complete, so the client can offer a button
 * that works rather than one that fails on press. A boolean only — it says
 * that a client id is configured, never what it is.
 */
auth.get('/status', (c) =>
  c.json({ googleConfigured: Boolean(c.env.GOOGLE_OAUTH_CLIENT_ID) }),
);

/** Redirects to Google, with `hd` pinned to the institute domain. */
auth.get('/login', async (c) => {
  const clientId = c.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    // This arrives as a top-level navigation from the sign-in button, so a
    // JSON body would land in the address bar as raw text.
    return loginFailed(
      c,
      'Sign-in is not set up on this deployment yet. The Google OAuth client still has to be configured.',
    );
  }

  const state = randomToken();
  const verifier = randomToken();
  const secure = isSecure(c.req.url);
  const options = transientCookieOptions(secure);

  setCookie(c, STATE_COOKIE, state, options);
  setCookie(c, VERIFIER_COOKIE, verifier, options);

  // Where to land afterwards. Only a same-site app path is kept: `//` would
  // be an open redirect to another host, and `/api/` would send the person
  // back into the login route they just came from.
  const next = c.req.query('next');
  if (
    next &&
    next.startsWith('/') &&
    !next.startsWith('//') &&
    !next.startsWith('/api/')
  ) {
    setCookie(c, RETURN_COOKIE, next, options);
  }

  return c.redirect(
    buildAuthorizationUrl({
      clientId,
      redirectUri: callbackUrl(c.req.url),
      state,
      codeChallenge: await codeChallengeFor(verifier),
      hostedDomain: c.env.GOOGLE_WORKSPACE_DOMAIN,
    }),
  );
});

auth.get('/callback', async (c) => {
  const secure = isSecure(c.req.url);
  const expectedState = getCookie(c, STATE_COOKIE);
  const verifier = getCookie(c, VERIFIER_COOKIE);
  const next = getCookie(c, RETURN_COOKIE) ?? '/';

  // One attempt per handshake, whatever the outcome.
  deleteCookie(c, STATE_COOKIE, { path: '/' });
  deleteCookie(c, VERIFIER_COOKIE, { path: '/' });
  deleteCookie(c, RETURN_COOKIE, { path: '/' });

  const denied = c.req.query('error');
  if (denied) {
    return loginFailed(c, `Google returned "${denied}". Please try signing in again.`);
  }

  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code || !state) {
    return loginFailed(c, 'That sign-in link is incomplete. Please start again.');
  }

  // Constant-time comparison is unnecessary: both values are ours and the
  // attacker cannot observe the result of a mismatch beyond this message.
  if (!expectedState || !verifier || state !== expectedState) {
    return loginFailed(
      c,
      'That sign-in attempt has expired or was started in another browser. Please try again.',
    );
  }

  let identity;
  try {
    const idToken = await exchangeCode({
      code,
      codeVerifier: verifier,
      clientId: c.env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: c.env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirectUri: callbackUrl(c.req.url),
    });

    identity = await verifyIdToken(
      idToken,
      c.env.GOOGLE_OAUTH_CLIENT_ID,
      c.env.GOOGLE_WORKSPACE_DOMAIN,
    );
  } catch (error) {
    return loginFailed(
      c,
      error instanceof Error ? error.message : 'Sign-in failed. Please try again.',
    );
  }

  // Authenticated by Google, but authority comes from the Access tab.
  const repo = await getRepo(c.env);
  const user = await repo.findUserAccess(identity.email);

  if (!user) {
    return loginFailed(
      c,
      `${identity.email} is not on the QPSB access list. Ask the Controller of Examinations to add you.`,
      403,
    );
  }

  const token = await issueSessionToken(
    // Google's profile name is fresher than the sheet's; the sheet decides
    // everything that grants authority.
    { ...user, name: identity.name || user.name },
    c.env.SESSION_SIGNING_KEY,
  );

  setCookie(c, SESSION_COOKIE, token, sessionCookieOptions(secure));
  return c.redirect(next);
});

auth.post('/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ success: true });
});

/**
 * Sign-in failures land in a browser, not in `fetch`, so they get a page
 * rather than JSON — a bare `{"error":…}` at the end of a redirect chain
 * tells the person nothing about what to do next.
 */
function loginFailed(c: Context<Env>, message: string, status: 400 | 403 = 400) {
  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return c.html(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign-in failed</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#eef2f7;
       font:16px/1.6 system-ui,sans-serif;color:#111d2b;padding:24px}
  .card{background:#fff;border:1px solid #cbd6e3;border-radius:10px;padding:28px 32px;
        max-width:44ch;display:flex;flex-direction:column;gap:14px}
  h1{margin:0;font-size:19px}
  p{margin:0;color:#56687c}
  a{align-self:flex-start;background:#0c5196;color:#fff;text-decoration:none;
    padding:9px 20px;border-radius:6px;font-size:14px;font-weight:600}
</style></head><body><div class="card">
<h1>Sign-in failed</h1><p>${escaped}</p><a href="/api/auth/login">Try again</a>
</div></body></html>`,
    status,
  );
}

export default auth;
