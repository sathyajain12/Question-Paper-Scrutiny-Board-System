/**
 * The session cookie (docs/ARCHITECTURE.md §6).
 *
 * A signed JWT carrying `{ email, name, role, departments[] }` — the whole
 * identity, so no request has to re-read the Access tab. That is the trade:
 * a role change in the sheet takes effect at the user's next sign-in rather
 * than immediately, which is why the lifetime is a working day and not a
 * month.
 *
 * HS256 rather than RS256: this token is issued and verified by the same
 * Worker, so there is no second party needing a public key, and a symmetric
 * secret is one less thing to rotate.
 */
import { SignJWT, jwtVerify } from 'jose';
import type { Role, SessionUser } from '@shared/types';

export const SESSION_COOKIE = 'qpsb_session';

/** One working day. Long enough to avoid a mid-afternoon re-login. */
export const SESSION_TTL_SECONDS = 10 * 60 * 60;

const ISSUER = 'qpsb-portal';
const AUDIENCE = 'qpsb-portal';

function secretKey(signingKey: string): Uint8Array {
  if (!signingKey || signingKey.length < 32) {
    // A short key here would still sign and verify, which is what makes it
    // dangerous — fail loudly rather than issue guessable sessions.
    throw new Error(
      'SESSION_SIGNING_KEY is missing or shorter than 32 characters.',
    );
  }
  return new TextEncoder().encode(signingKey);
}

export async function issueSessionToken(
  user: SessionUser,
  signingKey: string,
): Promise<string> {
  return new SignJWT({
    name: user.name,
    role: user.role,
    departments: user.departments,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.email)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey(signingKey));
}

/** Returns the user, or null for any token that fails verification. */
export async function readSessionToken(
  token: string,
  signingKey: string,
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(signingKey), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const email = payload.sub;
    const name = payload.name;
    const role = payload.role;
    const departments = payload.departments;

    // A token that verifies but carries the wrong shape is still not a
    // session — treat it as absent rather than trusting half of it.
    if (
      typeof email !== 'string' ||
      typeof name !== 'string' ||
      !isRole(role) ||
      !Array.isArray(departments) ||
      !departments.every((d) => typeof d === 'string')
    ) {
      return null;
    }

    return { email, name, role, departments: departments as string[] };
  } catch {
    return null;
  }
}

function isRole(value: unknown): value is Role {
  return value === 'admin' || value === 'hod' || value === 'viewer';
}

/**
 * Cookie attributes.
 *
 * `SameSite=Lax` rather than `Strict`: the browser arrives back from Google
 * on a top-level redirect, and `Strict` would withhold the cookie on that
 * first navigation, bouncing a freshly signed-in user straight back to login.
 */
export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'Lax' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}
