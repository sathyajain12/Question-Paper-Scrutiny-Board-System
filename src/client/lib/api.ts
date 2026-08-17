/**
 * Typed fetch wrapper. Same-origin, so the session cookie rides along
 * automatically — no token juggling in the client.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /**
   * True only for the stale-`version` case (§7) — the one conflict where the
   * refetch has already fixed things and a canned message is right.
   *
   * Other 409s (an illegal state transition, adding faculty who already
   * exist) carry a message written for the user, so they must not be
   * collapsed into "someone else changed this".
   */
  get isVersionConflict() {
    return this.code === 'VERSION_CONFLICT';
  }
}

const DEV_USER_STORAGE_KEY = 'qpsb.devUser';

/**
 * Development affordance: ?as=<email> in the page URL makes every API call
 * run as that user. It is remembered for the tab, because client-side
 * navigation drops the query string. The server honours the parameter only
 * when DEV_MODE is on, so this is inert in production.
 */
function withDevUser(path: string): string {
  const fromUrl = new URLSearchParams(window.location.search).get('as');
  if (fromUrl) sessionStorage.setItem(DEV_USER_STORAGE_KEY, fromUrl);

  const as = fromUrl ?? sessionStorage.getItem(DEV_USER_STORAGE_KEY);
  if (!as) return path;

  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}as=${encodeURIComponent(as)}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${withDevUser(path)}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (res.status === 401) {
    window.location.href = '/api/auth/login';
    throw new ApiError(401, 'Not signed in');
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    throw new ApiError(res.status, body.error ?? res.statusText, body.code);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
