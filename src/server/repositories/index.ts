/**
 * Repository factory — the single seam between mock and live data.
 *
 * When DEV_MODE is on we serve fixtures; otherwise we mint a Google access
 * token and talk to Sheets. This is the one line that changes when
 * credentials arrive.
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

export async function getRepo(env: Env['Bindings']): Promise<BoardRepo> {
  if (env.DEV_MODE === 'true') return createMockRepo();

  const accessToken = await getAccessToken(env.CACHE, {
    clientEmail: env.GOOGLE_SA_EMAIL,
    privateKey: env.GOOGLE_SA_PRIVATE_KEY,
  });

  return createSheetsRepo(env.SPREADSHEET_ID, accessToken, env.CACHE);
}

export async function getDriveRepo(env: Env['Bindings']): Promise<DriveRepo> {
  if (env.DEV_MODE === 'true') return createMockDriveRepo();

  const accessToken = await getAccessToken(env.CACHE, {
    clientEmail: env.GOOGLE_SA_EMAIL,
    privateKey: env.GOOGLE_SA_PRIVATE_KEY,
  });

  return createDriveRepo(accessToken);
}
