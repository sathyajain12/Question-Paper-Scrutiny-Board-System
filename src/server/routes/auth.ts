/**
 * Google OIDC, Authorization Code + PKCE (docs/ARCHITECTURE.md §6).
 * These routes are public — the login dance cannot require a session.
 */
import { Hono } from 'hono';
import type { Env } from '../env';

const auth = new Hono<Env>();

/** Redirects to Google, with `hd` pinned to the institute domain. */
auth.get('/login', (c) => {
  void c;
  // TODO Phase 1: generate state + PKCE verifier, stash in a short-lived
  // cookie, redirect to accounts.google.com/o/oauth2/v2/auth
  throw new Error('login not implemented');
});

auth.get('/callback', (c) => {
  void c;
  // TODO Phase 1:
  //   1. verify state, exchange code (+ verifier) for tokens
  //   2. verify the ID token against Google's JWKS
  //   3. assert hd === GOOGLE_WORKSPACE_DOMAIN and email_verified
  //   4. look the email up in the Access tab → role + departments
  //   5. issue the signed session cookie, redirect to /
  throw new Error('callback not implemented');
});

auth.post('/logout', (c) => {
  void c;
  throw new Error('logout not implemented');
});

export default auth;
