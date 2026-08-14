import type { SessionUser } from '@shared/types';

/** Bindings declared in wrangler.jsonc, plus per-request context. */
export interface Env {
  Bindings: {
    ASSETS: Fetcher;
    CACHE: KVNamespace;
    BOARD_LOCK: DurableObjectNamespace;

    // vars
    GOOGLE_WORKSPACE_DOMAIN: string;
    SPREADSHEET_ID: string;
    DRIVE_ROOT_FOLDER_ID: string;

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
