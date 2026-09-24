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

/**
 * Sends the person to Google, remembering where they were.
 *
 * `next` is the current in-app path, so a session that expires on
 * /admin/boards returns there rather than dumping them on the home screen.
 * The server accepts it only when it is a same-site path.
 */
export function redirectToLogin(): void {
  const { pathname, search } = window.location;

  // Never return to an API path. Without this the login URL nests inside its
  // own `next` once per attempt — click twice from a failed sign-in and the
  // address bar fills with escaped copies of itself.
  const next = pathname.startsWith('/api/') ? '/' : pathname + search;

  window.location.href = `/api/auth/login?next=${encodeURIComponent(next)}`;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  /**
   * Whether a 401 should bounce straight to Google.
   *
   * The session probe sets this false: on first load nobody is signed in
   * yet, and redirecting from there means the app never renders a sign-in
   * screen — it flashes "Checking access…" and jumps, which looks like a
   * fault rather than a prompt. Every other call keeps the redirect, because
   * a 401 there means a session expired mid-use.
   */
  redirectOn401 = true,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (res.status === 401) {
    if (redirectOn401) redirectToLogin();
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
  /** Resolves to null when nobody is signed in, instead of redirecting. */
  getSession: async <T>(path: string): Promise<T | null> => {
    try {
      return await request<T>(path, undefined, false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
