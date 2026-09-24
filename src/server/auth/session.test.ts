/**
 * Session cookie round-trip.
 *
 * The cases that matter are the rejections: a token this Worker will accept
 * is the whole of its authorisation, so anything that tampers with one has to
 * come back as "no session" rather than a partially-trusted user.
 */
import { describe, expect, it } from 'vitest';
import type { SessionUser } from '@shared/types';
import { issueSessionToken, readSessionToken } from './session';

const KEY = 'a'.repeat(48);
const OTHER_KEY = 'b'.repeat(48);

const ADMIN: SessionUser = {
  email: 'coe@sssihl.edu.in',
  name: 'Controller of Examinations',
  role: 'admin',
  departments: [],
};

const HOD: SessionUser = {
  email: 'hod.cs@sssihl.edu.in',
  name: 'Dr. M. Anand',
  role: 'hod',
  departments: ['Computer Science', 'Physics'],
};

describe('session tokens', () => {
  it('round-trips a user unchanged', async () => {
    const token = await issueSessionToken(HOD, KEY);
    await expect(readSessionToken(token, KEY)).resolves.toEqual(HOD);
  });

  it('keeps an admin’s empty department list empty', async () => {
    const token = await issueSessionToken(ADMIN, KEY);
    const back = await readSessionToken(token, KEY);
    expect(back?.role).toBe('admin');
    expect(back?.departments).toEqual([]);
  });

  it('rejects a token signed with a different key', async () => {
    const token = await issueSessionToken(ADMIN, KEY);
    await expect(readSessionToken(token, OTHER_KEY)).resolves.toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const token = await issueSessionToken(HOD, KEY);
    const [header, , signature] = token.split('.');

    // Re-encode the claims as an admin, keeping the original signature —
    // the classic "edit the middle segment" attempt.
    const forged = btoa(
      JSON.stringify({ sub: HOD.email, name: HOD.name, role: 'admin', departments: [] }),
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await expect(
      readSessionToken(`${header}.${forged}.${signature}`, KEY),
    ).resolves.toBeNull();
  });

  it('rejects junk', async () => {
    await expect(readSessionToken('not-a-jwt', KEY)).resolves.toBeNull();
    await expect(readSessionToken('', KEY)).resolves.toBeNull();
  });

  it('refuses to sign with a key short enough to guess', async () => {
    await expect(issueSessionToken(ADMIN, 'short')).rejects.toThrow(
      /SESSION_SIGNING_KEY/,
    );
  });
});
