/**
 * Outbound email.
 *
 * One seam, so the rest of the server never learns which provider is behind
 * it — the same reasoning as `repositories/`. Today there is exactly one
 * caller (the support desk telling the office a HoD is waiting); the
 * appointment letters in Phase 5 are the next one, and they should come
 * through here rather than growing a second path.
 *
 * In DEV_MODE, and whenever the key or the recipient is unset, this logs
 * instead of sending. That matches how every other notification in this
 * codebase currently behaves (`notify-admin`, `request-changes`, `close`) and
 * means the workflow is wired end to end before credentials exist — the
 * alternative, throwing, would make the desk unusable in development.
 */
import type { Env } from '../env';

export interface OutboundEmail {
  to: string;
  subject: string;
  /** Plain text. Keep it short — these are prompts to go and look, not reports. */
  text: string;
}

export type MailResult =
  | { sent: true }
  | { sent: false; reason: 'dev-mode' | 'not-configured' | 'failed'; detail?: string };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** The COE office address is a placeholder until IT supplies the real one. */
export function isMailConfigured(env: Env['Bindings']): boolean {
  return Boolean(
    env.RESEND_API_KEY &&
      env.SUPPORT_NOTIFY_EMAIL &&
      !env.SUPPORT_NOTIFY_EMAIL.startsWith('TODO'),
  );
}

export async function sendEmail(
  env: Env['Bindings'],
  email: OutboundEmail,
): Promise<MailResult> {
  if (env.DEV_MODE === 'true') {
    console.log(`[Mail·dev] to=${email.to} subject=${email.subject}\n${email.text}`);
    return { sent: false, reason: 'dev-mode' };
  }

  if (!isMailConfigured(env)) {
    console.warn(
      `[Mail] Not configured — dropped "${email.subject}". Set RESEND_API_KEY and SUPPORT_NOTIFY_EMAIL.`,
    );
    return { sent: false, reason: 'not-configured' };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `QPSB Portal <no-reply@${env.GOOGLE_WORKSPACE_DOMAIN}>`,
        to: [email.to],
        subject: email.subject,
        text: email.text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(`[Mail] ${response.status} sending "${email.subject}": ${detail}`);
      return { sent: false, reason: 'failed', detail };
    }

    return { sent: true };
  } catch (error) {
    // A notification is best-effort: never let it take down the caller.
    console.error('[Mail] Request failed', error);
    return {
      sent: false,
      reason: 'failed',
      detail: error instanceof Error ? error.message : undefined,
    };
  }
}
