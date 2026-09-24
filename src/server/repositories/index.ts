/**
 * Repository factory — the single seam between mock and live data.
 *
 * `DATA_SOURCE` picks the implementation: fixtures for a demo or a test, the
 * live workbook otherwise. It does not touch authentication — sign-in is real
 * Google OIDC on every environment.
 */
import type { Env } from '../env';
import { getAccessToken } from '../google/sa-token';
import { createMockRepo } from './mock-sheets';
import { createMockDriveRepo } from './mock-drive';
import { createSheetsRepo } from './sheets';
import { createDriveRepo } from './drive';
import type { BoardRepo } from './types';
import type { DriveRepo } from './drive-types';

export type { BoardRepo } from './types';
export type { DriveRepo } from './drive-types';

/** True when this deployment is serving sample data rather than the workbook. */
export function usingFixtures(env: Env['Bindings']): boolean {
  return env.DATA_SOURCE !== 'sheets';
}

export async function getRepo(env: Env['Bindings']): Promise<BoardRepo> {
  if (usingFixtures(env)) return createMockRepo();

  const accessToken = await getAccessToken(env.CACHE, {
    clientEmail: env.GOOGLE_SA_EMAIL,
    privateKey: env.GOOGLE_SA_PRIVATE_KEY,
  });

  return createSheetsRepo(env.SPREADSHEET_ID, accessToken, env.CACHE);
}

export async function getDriveRepo(env: Env['Bindings']): Promise<DriveRepo> {
  if (usingFixtures(env)) return createMockDriveRepo();

  const accessToken = await getAccessToken(env.CACHE, {
    clientEmail: env.GOOGLE_SA_EMAIL,
    privateKey: env.GOOGLE_SA_PRIVATE_KEY,
  });

  return createDriveRepo(accessToken);
}
