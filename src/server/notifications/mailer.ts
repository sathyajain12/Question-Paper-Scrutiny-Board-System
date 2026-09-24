/**
 * Outbound email.
 *
 * One seam, so the rest of the server never learns which provider is behind
 * it — the same reasoning as `repositories/`. Today there is exactly one
 * caller (the support desk telling the office a HoD is waiting); the
 * appointment letters in Phase 5 are the next one, and they should come
 * through here rather than growing a second path.
 *
 * Whenever the API key or the recipient is unset, this logs the message
 * instead of sending it. That means the workflow is wired end to end before
 * credentials exist — the alternative, throwing, would make the support desk
 * and every board action unusable in development.
 */
import type { Env } from '../env';

export interface OutboundEmail {
  to: string | string[];
  subject: string;
  /** Plain text. Keep it short — these are prompts to go and look, not reports. */
  text: string;
  /**
   * Optional HTML alternative. Every board notification sends both: the text
   * part is what lands in a plain-text client and in the dev-mode log, so it
   * has to carry the same facts rather than say "see the HTML version".
   */
  html?: string;
  cc?: string | string[];
}

/** An addressee plus the people copied — what the notification layer resolves to. */
export interface RenderedEmailRecipients {
  to: string;
  cc: string[];
}

export type MailResult =
  | { sent: true }
  | {
      sent: false;
      reason: 'not-configured' | 'no-recipient' | 'failed';
      detail?: string;
    };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * A configured address is one someone will actually receive. The seeded
 * placeholders read `TODO_...`, and sending to those is worse than dropping
 * the mail — it looks delivered and isn't.
 */
export function isRealAddress(address: string | undefined | null): boolean {
  if (!address) return false;
  const trimmed = address.trim();
  return trimmed.length > 0 && !trimmed.startsWith('TODO') && trimmed.includes('@');
}

/** Can the transport send at all? Per-recipient validity is checked separately. */
export function isMailConfigured(env: Env['Bindings']): boolean {
  return Boolean(env.RESEND_API_KEY);
}

function recipients(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  // Dedupe case-insensitively: the HoD is usually also a board member, and a
  // duplicated address makes Resend reject the whole message.
  const seen = new Set<string>();
  return list
    .map((address) => address.trim())
    .filter((address) => {
      if (!isRealAddress(address)) return false;
      const key = address.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export async function sendEmail(
  env: Env['Bindings'],
  email: OutboundEmail,
): Promise<MailResult> {
  const to = recipients(email.to);
  const cc = recipients(email.cc).filter(
    (address) => !to.some((t) => t.toLowerCase() === address.toLowerCase()),
  );

  if (to.length === 0) {
    console.warn(`[Mail] No usable recipient — dropped "${email.subject}".`);
    return { sent: false, reason: 'no-recipient' };
  }

  // No API key is the normal state in development, so log the whole message
  // rather than a one-line warning — this is how the workflow gets reviewed
  // before credentials exist.
  if (!isMailConfigured(env)) {
    console.log(
      `[Mail·unsent] to=${to.join(', ')}` +
        (cc.length ? ` cc=${cc.join(', ')}` : '') +
        `\nsubject=${email.subject}\n${email.text}`,
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
        to,
        ...(cc.length ? { cc } : {}),
        subject: email.subject,
        text: email.text,
        ...(email.html ? { html: email.html } : {}),
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
