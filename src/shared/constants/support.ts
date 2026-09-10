/**
 * Support-desk configuration, shared by both sides.
 *
 * The phone number is the fallback path: when no administrator is connected
 * to the portal, the help widget shows it so the HoD is never left with a
 * dead end. It is deliberately a placeholder — a plausible-looking but wrong
 * number is worse than an obvious TODO, because a HoD would actually dial it.
 *
 * Set `number` to the real COE office line before deploying. The UI checks
 * `isSupportPhoneConfigured()` and degrades gracefully until you do.
 */

export const SUPPORT_PHONE = {
  /** TODO: replace with the real COE office number, e.g. '+91 8555 287375'. */
  number: 'TODO_SET_COE_OFFICE_NUMBER',
  label: 'COE Office',
  hours: 'Monday–Friday, 9:30 AM – 5:30 PM',
} as const;

export function isSupportPhoneConfigured(): boolean {
  return !SUPPORT_PHONE.number.startsWith('TODO');
}

/**
 * `tel:` target — digits and a leading `+` only, since spaces and dashes are
 * for humans and confuse some dialers.
 */
export function supportPhoneHref(): string {
  return `tel:${SUPPORT_PHONE.number.replace(/[^\d+]/g, '')}`;
}

/** Matches the Zod bound in schemas/support.ts, so the composer and the server agree. */
export const MAX_SUPPORT_MESSAGE_LENGTH = 2000;

/**
 * Typing indicators.
 *
 * `TTL` is how long the indicator stays lit after the last `typing` frame;
 * `THROTTLE` is how often a client may send one. **The TTL must stay
 * comfortably larger than the throttle**, or someone typing steadily would
 * flicker between states. Expiring on a timeout — rather than waiting for a
 * "stopped typing" frame — also means a closed tab cannot leave someone
 * typing forever.
 */
export const TYPING_TTL_MS = 4000;
export const TYPING_THROTTLE_MS = 2000;

/**
 * The desk is a single Durable Object instance — every HoD and every admin
 * connects to the same one, which is what makes presence a fact rather than
 * a guess assembled from heartbeats.
 */
export const SUPPORT_DESK_ID = 'qpsb-support-desk';
