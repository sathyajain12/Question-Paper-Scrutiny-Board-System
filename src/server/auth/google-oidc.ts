/**
 * Google OpenID Connect, Authorization Code + PKCE (docs/ARCHITECTURE.md §6).
 *
 * PKCE is used even though this is a confidential client with a secret. It
 * costs one hash and closes the window where a leaked authorization code —
 * out of a proxy log, a referrer header, a shared browser's history — can be
 * redeemed by anyone but the browser that started the flow.
 *
 * Three checks decide whether a Google identity becomes a session, and all
 * three have to pass:
 *
 *   1. the ID token's signature verifies against Google's published JWKS,
 *   2. `email_verified` is true, and
 *   3. `hd` equals the institute's Workspace domain.
 *
 * (3) is the one that matters here. Without it any Google account on earth
 * satisfies (1) and (2) — the token is perfectly valid, it simply belongs to
 * someone outside the institute.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/** Cached across requests in the same isolate; `jose` handles its own TTL. */
const jwks = createRemoteJWKSet(new URL(JWKS_URI));

export interface GoogleIdentity {
  email: string;
  name: string;
  /** The Workspace domain the account belongs to. */
  hostedDomain: string | null;
}

// ── PKCE ─────────────────────────────────────────────────────────────

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(byteLength = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function codeChallengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return base64Url(digest);
}

// ── Authorization request ────────────────────────────────────────────

export function buildAuthorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  hostedDomain: string;
}): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // A hint, not a guarantee — Google will still return accounts from other
  // domains, which is why the callback re-checks `hd` on the ID token.
  url.searchParams.set('hd', params.hostedDomain);
  // Always show the chooser: institute machines are shared, and silently
  // reusing whichever account happens to be signed in is a real hazard here.
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

// ── Code exchange + verification ─────────────────────────────────────

interface TokenResponse {
  id_token?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeCode(params: {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      code_verifier: params.codeVerifier,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as TokenResponse;

  if (!res.ok || !body.id_token) {
    const detail = body.error_description ?? body.error ?? `HTTP ${res.status}`;
    throw new Error(`Google rejected the authorization code: ${detail}`);
  }

  return body.id_token;
}

/**
 * Verifies the ID token and applies the institute checks. Throws with a
 * message safe to show a person — these surface on the login page, and
 * "you signed in with a personal account" is more use than "invalid token".
 */
export async function verifyIdToken(
  idToken: string,
  clientId: string,
  hostedDomain: string,
): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: ISSUERS,
    audience: clientId,
  });

  const email = typeof payload.email === 'string' ? payload.email : '';
  const emailVerified = payload.email_verified === true;
  const hd = typeof payload.hd === 'string' ? payload.hd : null;
  const name = typeof payload.name === 'string' ? payload.name : email;

  if (!email || !emailVerified) {
    throw new Error('That Google account has no verified email address.');
  }

  if (hd !== hostedDomain) {
    throw new Error(
      `Sign in with your ${hostedDomain} account — ${email} is outside the institute.`,
    );
  }

  return { email: email.toLowerCase(), name, hostedDomain: hd };
}
