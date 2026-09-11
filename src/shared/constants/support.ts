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
 * Image attachments.
 *
 * Pictures are downscaled and re-encoded in the browser before they are sent,
 * because a Durable Object storage value has a hard ceiling and a phone photo
 * is an order of magnitude past it. `MAX_IMAGE_BYTES` is the budget the
 * client compresses *towards* and the server enforces; `MAX_IMAGE_EDGE` is
 * the longest side we keep, which is ample for a screenshot of the portal —
 * the thing HoDs will actually send.
 *
 * At production scale these belong in R2 with the message holding a key. This
 * keeps them in the object with everything else, which needs no new
 * infrastructure and is honest about its limit.
 */
export const MAX_IMAGE_EDGE = 1280;
export const MAX_IMAGE_BYTES = 96 * 1024;
/** Base64 inflates by ~4/3; the wire value must still fit a storage write. */
export const MAX_IMAGE_DATA_URL_LENGTH = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 256;

export const ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

/**
 * How long a HoD's message may sit unanswered, with no administrator
 * connected, before the office is emailed about it.
 *
 * The desk is only trustworthy if it reaches someone when nobody is watching
 * it — otherwise a message written at 9pm simply waits for whenever an admin
 * next signs in. The delay exists so an admin who is about to log in anyway
 * is not emailed about something they are seconds from seeing.
 */
export const NOTIFY_OFFICE_AFTER_MS = 5 * 60_000;

/**
 * Don't email the office about the same thread more often than this, however
 * many messages arrive — a HoD typing five lines in a row is one problem, not
 * five.
 */
export const NOTIFY_OFFICE_COOLDOWN_MS = 60 * 60_000;

/**
 * What a thread turned out to be about, chosen by the **administrator** when
 * they resolve it — never by the HoD when they open it.
 *
 * That asymmetry is the whole point. Asking a HoD to categorise a problem
 * before describing it is the ceremony that makes people phone instead, and
 * they are guessing anyway. The admin knows what it actually was once it is
 * answered, and by then it costs one dropdown.
 *
 * The value is the report, not the label: "we answered the same faculty-list
 * question thirty times this term" is the sentence that tells you what to fix
 * in the portal or the FAQ.
 */
export const SUPPORT_CATEGORIES = [
  'Faculty list',
  'Scheduling',
  'Files or Drive',
  'Access or sign-in',
  'Board status',
  'Something else',
] as const;

/** Prefix for the human-quotable thread reference, e.g. QPSB-104. */
export const SUPPORT_REFERENCE_PREFIX = 'QPSB';
/** References start here so the first one does not read as a test. */
export const SUPPORT_REFERENCE_START = 100;

/** A thread's title is taken from its opening message rather than a form. */
export const MAX_SUBJECT_LENGTH = 80;

/**
 * The desk is a single Durable Object instance — every HoD and every admin
 * connects to the same one, which is what makes presence a fact rather than
 * a guess assembled from heartbeats.
 */
export const SUPPORT_DESK_ID = 'qpsb-support-desk';
