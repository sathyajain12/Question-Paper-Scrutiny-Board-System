/**
 * Service-account access tokens on Workers.
 *
 * The `googleapis` / `google-auth-library` packages are Node-only and cannot
 * run here, so we mint the assertion ourselves: build a JWT, sign it RS256
 * with WebCrypto, and exchange it at Google's token endpoint. The resulting
 * access token is cached in KV for 55 minutes (they live 60).
 *
 * Phase 0 spike result: the signing path is verified in sa-token.test.ts,
 * which runs inside the real workerd runtime.
 */

export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const JWT_BEARER_GRANT = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

const CACHE_KEY = 'google:sa:access_token';
const TOKEN_TTL_SECONDS = 55 * 60;
const ASSERTION_LIFETIME_SECONDS = 3600;

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
] as const;

export interface SaCredentials {
  clientEmail: string;
  /** PEM contents of the service-account key. */
  privateKey: string;
  /**
   * Only for domain-wide delegation — the user to impersonate. Needed if
   * appointment mail must come from a real person's address; omit otherwise.
   */
  subject?: string;
}

// ── base64url helpers ────────────────────────────────────────────────

function base64UrlEncode(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);

  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Strips the PEM armour and base64-decodes to the DER bytes SubtleCrypto wants. */
export function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    // Secrets are stored with literal \n escapes; accept both forms.
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');

  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ── assertion ────────────────────────────────────────────────────────

/**
 * Builds and RS256-signs the JWT that is exchanged for an access token.
 * Pure and side-effect free, so it can be verified without network access.
 */
export async function createAssertion(
  creds: SaCredentials,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };

  const claims: Record<string, unknown> = {
    iss: creds.clientEmail,
    scope: SCOPES.join(' '),
    aud: TOKEN_ENDPOINT,
    iat: nowSeconds,
    exp: nowSeconds + ASSERTION_LIFETIME_SECONDS,
  };
  if (creds.subject) claims.sub = creds.subject;

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(claims),
  )}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(creds.privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

// ── token exchange ───────────────────────────────────────────────────

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Returns a cached access token, minting a new one when the cache is cold.
 * Every Sheets/Drive call goes through this, so the KV hit is the hot path.
 */
export async function getAccessToken(
  kv: KVNamespace,
  creds: SaCredentials,
): Promise<string> {
  const cached = await kv.get(CACHE_KEY);
  if (cached) return cached;

  const assertion = await createAssertion(creds);

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: JWT_BEARER_GRANT,
      assertion,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Google token exchange failed (${res.status}): ${detail.slice(0, 300)}`,
    );
  }

  const token = (await res.json()) as TokenResponse;

  // Expire our copy slightly before Google does, so we never present a
  // token that dies mid-request.
  await kv.put(CACHE_KEY, token.access_token, {
    expirationTtl: Math.min(TOKEN_TTL_SECONDS, token.expires_in - 60),
  });

  return token.access_token;
}
