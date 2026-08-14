/**
 * PHASE 0 SPIKE 1 — can a Cloudflare Worker authenticate to Google?
 *
 * The question: `google-auth-library` is Node-only, so the RS256 assertion
 * must be signed with WebCrypto inside workerd. If that does not work, the
 * Cloudflare choice collapses and we move to a Node runtime.
 *
 * These tests run in the real workerd runtime (see vitest.config.ts), so a
 * pass here is a pass in production. They generate their own RSA keypair —
 * no service-account credentials needed, and nothing leaves the machine.
 *
 * What remains untested until a real key exists: the token exchange itself,
 * which is a plain form POST and the low-risk half.
 */
import { describe, expect, it } from 'vitest';
import { createAssertion, pemToArrayBuffer, SCOPES, TOKEN_ENDPOINT } from './sa-token';

/** Generates an RSA-2048 keypair and exports the private half as PKCS8 PEM. */
async function generateTestKeyPair() {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );

  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;

  return { pem, publicKey: pair.publicKey };
}

function decodeSegment(segment: string): Record<string, unknown> {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(padded));
}

describe('service-account assertion (Phase 0 spike)', () => {
  it('imports a PKCS8 PEM key in workerd', async () => {
    const { pem } = await generateTestKeyPair();

    const key = await crypto.subtle.importKey(
      'pkcs8',
      pemToArrayBuffer(pem),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    expect(key.type).toBe('private');
  });

  it('accepts a PEM whose newlines are escaped, as stored in secrets', async () => {
    const { pem } = await generateTestKeyPair();
    const escaped = pem.replace(/\n/g, '\\n');

    // Must produce identical DER bytes to the unescaped form.
    expect(pemToArrayBuffer(escaped).byteLength).toBe(
      pemToArrayBuffer(pem).byteLength,
    );
  });

  it('produces a signature Google will accept', async () => {
    const { pem, publicKey } = await generateTestKeyPair();

    const jwt = await createAssertion({
      clientEmail: 'qpsb-portal@example.iam.gserviceaccount.com',
      privateKey: pem,
    });

    const [header, payload, signature] = jwt.split('.');
    expect(signature).toBeTruthy();

    // Verify the signature exactly as Google's servers would.
    const sigBytes = Uint8Array.from(
      atob(signature!.replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0),
    );

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      sigBytes,
      new TextEncoder().encode(`${header}.${payload}`),
    );

    expect(valid).toBe(true);
  });

  it('emits the claims Google requires', async () => {
    const now = 1_800_000_000;
    const { pem } = await generateTestKeyPair();

    const jwt = await createAssertion(
      {
        clientEmail: 'qpsb-portal@example.iam.gserviceaccount.com',
        privateKey: pem,
      },
      now,
    );

    const [rawHeader, rawPayload] = jwt.split('.');
    expect(decodeSegment(rawHeader!)).toEqual({ alg: 'RS256', typ: 'JWT' });

    const claims = decodeSegment(rawPayload!);
    expect(claims.iss).toBe('qpsb-portal@example.iam.gserviceaccount.com');
    expect(claims.aud).toBe(TOKEN_ENDPOINT);
    expect(claims.scope).toBe(SCOPES.join(' '));
    expect(claims.iat).toBe(now);
    // Google rejects assertions living longer than an hour.
    expect((claims.exp as number) - (claims.iat as number)).toBe(3600);
    // `sub` must be absent unless domain-wide delegation is in use.
    expect(claims).not.toHaveProperty('sub');
  });

  it('includes sub only when impersonating (domain-wide delegation)', async () => {
    const { pem } = await generateTestKeyPair();

    const jwt = await createAssertion({
      clientEmail: 'qpsb-portal@example.iam.gserviceaccount.com',
      privateKey: pem,
      subject: 'coe@sssihl.edu.in',
    });

    expect(decodeSegment(jwt.split('.')[1]!).sub).toBe('coe@sssihl.edu.in');
  });
});
