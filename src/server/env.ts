import type { SessionUser } from '@shared/types';

/** Bindings declared in wrangler.jsonc, plus per-request context. */
export interface Env {
  Bindings: {
    ASSETS: Fetcher;
    CACHE: KVNamespace;
    BOARD_LOCK: DurableObjectNamespace;
    /** Singleton support desk — live HoD ↔ admin chat and presence. */
    SUPPORT_CHAT: DurableObjectNamespace;

    // vars
    /**
     * Where board data comes from: `"sheets"` (live workbook) or
     * `"fixtures"` (in-memory sample data).
     *
     * This controls the **data source only**. Authentication is always real
     * Google OIDC — the flag it replaced, DEV_MODE, also switched off auth,
     * which meant one wrong variable exposed an admin console.
     */
    DATA_SOURCE: 'sheets' | 'fixtures' | string;
    GOOGLE_WORKSPACE_DOMAIN: string;
    SPREADSHEET_ID: string;
    DRIVE_ROOT_FOLDER_ID: string;
    /** Where the support desk emails unanswered threads. Placeholder until set. */
    SUPPORT_NOTIFY_EMAIL: string;
    /**
     * Who in the office hears about board activity — comma-separated. The
     * first address is written to, the rest are copied. Falls back to
     * SUPPORT_NOTIFY_EMAIL when unset.
     */
    ADMIN_NOTIFY_EMAILS: string;
    /** Absolute base URL used for the "open the portal" links in emails. */
    PORTAL_URL: string;
    /** e.g. "April 2026" — appended to email subjects. Optional. */
    EXAM_PERIOD: string;

    // secrets — `wrangler secret put`
    /**
     * Unlocks the temporary demo sign-in at /api/auth/demo. Only honoured
     * while DATA_SOURCE is fixtures; unset means the route does not exist.
     * Remove once Google sign-in is configured.
     */
    DEMO_ACCESS_KEY: string;

    // secrets — `wrangler secret put`
    GOOGLE_OAUTH_CLIENT_ID: string;
    GOOGLE_OAUTH_CLIENT_SECRET: string;
    GOOGLE_SA_EMAIL: string;
    GOOGLE_SA_PRIVATE_KEY: string;
    SESSION_SIGNING_KEY: string;
    RESEND_API_KEY: string;
  };
  Variables: {
    /** Set by requireSession. Authority comes from here — never from the body. */
    user: SessionUser;
  };
}
