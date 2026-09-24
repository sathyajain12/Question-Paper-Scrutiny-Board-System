/**
 * Board lifecycle notifications.
 *
 * Every function here is **fire-and-forget**: it catches its own failures and
 * returns. A dead mailbox must never fail the approval it was attached to —
 * the decision is already recorded in the sheet by the time we get here, and
 * throwing would hand the user a 500 for a board that did change. This is the
 * same forgiving pattern the Apps Script portal used, and the reason each
 * caller in `routes/boards.ts` ignores the result.
 *
 * Recipients are resolved here rather than passed in, so a route cannot be
 * tricked into mailing an address from the request body.
 */
import type { Env } from '../env';
import type { BoardRepo } from '../repositories/types';
import type { BoardDetail, FacultyMember, SessionUser } from '@shared/types';
import { sendEmail, type RenderedEmailRecipients } from './mailer';
import * as templates from './templates';

/**
 * Who in the office hears about board activity. Comma-separated; the first is
 * the addressee and the rest are copied, which is how the Apps Script version
 * treated its three-entry ADMIN_EMAILS list.
 */
function officeAddresses(env: Env['Bindings']): { to: string; cc: string[] } {
  const parsed = (env.ADMIN_NOTIFY_EMAILS ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);

  // Fall back to the support desk address: it is the one office mailbox this
  // deployment is already known to have, so a half-configured environment
  // still reaches a person rather than silently dropping the mail.
  const fallback = env.SUPPORT_NOTIFY_EMAIL ?? '';
  const [first = fallback, ...rest] = parsed;
  return { to: first, cc: rest };
}

/**
 * Null when unset or still a placeholder — the templates then omit the link
 * rather than print `TODO_SET_PORTAL_URL` into somebody's inbox.
 */
function portalUrl(env: Env['Bindings']): string | null {
  const value = (env.PORTAL_URL ?? '').trim();
  if (!value || value.startsWith('TODO')) return null;
  return value;
}

/** e.g. "April 2026". Unset simply drops it from subject lines. */
function examPeriod(env: Env['Bindings']): string | null {
  const value = (env.EXAM_PERIOD ?? '').trim();
  return value && !value.startsWith('TODO') ? value : null;
}

/** Swallows everything. See the note at the top of the file. */
async function notify(
  label: string,
  send: () => Promise<unknown>,
): Promise<void> {
  try {
    await send();
  } catch (error) {
    console.error(`[Notify] ${label} failed`, error);
  }
}

/**
 * A display name for an address, from the people already on the board.
 *
 * The submitter is not always in the `Access` tab — a HoD may hold a Faculty
 * row under a departmental address and sign in under another — and greeting
 * someone "Dear phy1@sssihl.edu.in" is worse than not greeting them at all.
 * The board carries the names, so use them before giving up.
 */
function nameFromBoard(board: BoardDetail, email: string): string | null {
  const key = email.toLowerCase();
  if (board.chairperson && board.chairperson.email.toLowerCase() === key) {
    return board.chairperson.name;
  }
  return board.members.find((m) => m.email.toLowerCase() === key)?.name ?? null;
}

/**
 * The HoD to write to about this board: whoever submitted it. Falls back to
 * the chairperson, which matters for a board an admin acted on before any
 * submission was recorded.
 */
async function hodContact(
  repo: BoardRepo,
  board: BoardDetail,
): Promise<{ email: string; name: string } | null> {
  if (board.submittedBy) {
    const user = await repo.findUserAccess(board.submittedBy);
    if (user) return { email: user.email, name: user.name };

    const name = nameFromBoard(board, board.submittedBy);
    if (name) return { email: board.submittedBy, name };

    // Nothing anywhere knows this address. Write to it, but address the
    // message to the role rather than echoing the mailbox back at them.
    console.warn(`[Notify] No display name for ${board.submittedBy}`);
    return { email: board.submittedBy, name: 'Sir / Madam' };
  }

  if (board.chairperson) {
    return { email: board.chairperson.email, name: board.chairperson.name };
  }

  console.warn(`[Notify] No HoD contact for board ${board.boardId}`);
  return null;
}

function dispatch(
  env: Env['Bindings'],
  rendered: templates.RenderedEmail,
  addresses: RenderedEmailRecipients,
) {
  return sendEmail(env, {
    to: addresses.to,
    cc: addresses.cc,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  });
}

// ── Senders ──────────────────────────────────────────────────────────

export function notifyBoardSubmitted(
  env: Env['Bindings'],
  board: BoardDetail,
  submitter: SessionUser,
): Promise<void> {
  return notify('board-submitted', async () => {
    const office = officeAddresses(env);
    const rendered = templates.boardSubmitted(
      board,
      submitter.name,
      portalUrl(env),
      examPeriod(env),
    );
    await dispatch(env, rendered, office);
  });
}

export function notifyBoardApproved(
  env: Env['Bindings'],
  repo: BoardRepo,
  board: BoardDetail,
): Promise<void> {
  return notify('board-approved', async () => {
    const hod = await hodContact(repo, board);
    if (!hod) return;

    const office = officeAddresses(env);
    const rendered = templates.boardApproved(board, hod.name, examPeriod(env));
    await dispatch(env, rendered, { to: hod.email, cc: office.cc });
  });
}

export function notifyBoardRejected(
  env: Env['Bindings'],
  repo: BoardRepo,
  board: BoardDetail,
  reason: string,
): Promise<void> {
  return notify('board-rejected', async () => {
    const hod = await hodContact(repo, board);
    if (!hod) return;

    const office = officeAddresses(env);
    const rendered = templates.boardRejected(
      board,
      hod.name,
      reason,
      portalUrl(env),
      examPeriod(env),
    );
    await dispatch(env, rendered, { to: hod.email, cc: office.cc });
  });
}

export function notifyDatesOffered(
  env: Env['Bindings'],
  repo: BoardRepo,
  board: BoardDetail,
  dates: string[],
): Promise<void> {
  return notify('dates-offered', async () => {
    const hod = await hodContact(repo, board);
    if (!hod) return;

    const office = officeAddresses(env);
    const rendered = templates.datesOffered(
      board,
      hod.name,
      dates,
      portalUrl(env),
      examPeriod(env),
    );
    await dispatch(env, rendered, { to: hod.email, cc: office.cc });
  });
}

export function notifyScheduleConfirmed(
  env: Env['Bindings'],
  board: BoardDetail,
  actor: SessionUser,
  dates: string[],
  time: string,
): Promise<void> {
  return notify('schedule-confirmed', async () => {
    const office = officeAddresses(env);
    const rendered = templates.scheduleConfirmed(
      board,
      actor.name,
      dates,
      time,
      portalUrl(env),
      examPeriod(env),
    );
    await dispatch(env, rendered, office);
  });
}

/**
 * The appointment letter. Unlike the rest, this one reports what happened:
 * the admin pressed a button whose only effect is the email, so "sent" or
 * "not sent, because X" has to reach the UI.
 */
export async function sendAppointmentLetter(
  env: Env['Bindings'],
  repo: BoardRepo,
  board: BoardDetail,
): Promise<{ sent: boolean; recipients: string[]; reason?: string }> {
  const dates = templates.selectedDates(board);
  if (dates.length === 0) {
    return { sent: false, recipients: [], reason: 'No session date has been confirmed yet.' };
  }
  if (!board.sessionTime) {
    return { sent: false, recipients: [], reason: 'No session time has been confirmed yet.' };
  }

  const hod = await hodContact(repo, board);
  const chairperson = board.chairperson;
  const chairName = chairperson?.name ?? hod?.name ?? 'Chairperson';
  const chairEmail = chairperson?.email ?? hod?.email ?? '';

  if (!chairEmail) {
    return { sent: false, recipients: [], reason: 'No chairperson address for this board.' };
  }

  // The chairperson is addressed; members are copied. Anyone listed as both
  // is dropped from the copy list by the mailer.
  const members: FacultyMember[] = board.members.filter(
    (m) => m.email.toLowerCase() !== chairEmail.toLowerCase(),
  );

  const office = officeAddresses(env);
  const rendered = templates.appointmentLetter(
    board,
    chairName,
    members,
    dates,
    board.sessionTime,
    examPeriod(env),
  );

  const result = await sendEmail(env, {
    to: chairEmail,
    cc: [...members.map((m) => m.email), ...office.cc, office.to],
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  });

  const recipients = [chairEmail, ...members.map((m) => m.email)];

  if (result.sent) return { sent: true, recipients };
  return {
    sent: false,
    recipients,
    reason:
      result.reason === 'not-configured'
        ? 'Email is not configured on this deployment — the letter was logged instead of sent. Set RESEND_API_KEY.'
        : result.reason === 'no-recipient'
          ? 'No usable recipient address on this board.'
          : (result.detail ?? 'The mail provider rejected the message.'),
  };
}

export function notifyChangesRequested(
  env: Env['Bindings'],
  repo: BoardRepo,
  board: BoardDetail,
): Promise<void> {
  return notify('changes-requested', async () => {
    const hod = await hodContact(repo, board);
    if (!hod) return;

    const office = officeAddresses(env);
    const rendered = templates.changesRequested(
      board,
      hod.name,
      portalUrl(env),
      examPeriod(env),
    );
    await dispatch(env, rendered, { to: hod.email, cc: office.cc });
  });
}

export function notifyChangesIncorporated(
  env: Env['Bindings'],
  board: BoardDetail,
  actor: SessionUser,
): Promise<void> {
  return notify('changes-incorporated', async () => {
    const office = officeAddresses(env);
    const rendered = templates.changesIncorporated(
      board,
      actor.name,
      portalUrl(env),
      examPeriod(env),
    );
    await dispatch(env, rendered, office);
  });
}

export function notifyFilesComplete(
  env: Env['Bindings'],
  board: BoardDetail,
  actor: SessionUser,
): Promise<void> {
  return notify('files-complete', async () => {
    const office = officeAddresses(env);
    const rendered = templates.filesComplete(
      board,
      actor.name,
      portalUrl(env),
      examPeriod(env),
    );
    await dispatch(env, rendered, office);
  });
}

/**
 * Board closed. Sent individually rather than as one message with everyone
 * copied: each recipient has to send their *own* destruction acknowledgement,
 * and a group thread invites one reply on behalf of all.
 */
export function notifyBoardClosed(
  env: Env['Bindings'],
  repo: BoardRepo,
  board: BoardDetail,
): Promise<void> {
  return notify('board-closed', async () => {
    const office = officeAddresses(env);
    const hod = await hodContact(repo, board);

    const people = new Map<string, string>();
    if (hod) people.set(hod.email.toLowerCase(), hod.name);
    if (board.chairperson) {
      people.set(board.chairperson.email.toLowerCase(), board.chairperson.name);
    }
    for (const member of board.members) {
      people.set(member.email.toLowerCase(), member.name);
    }

    for (const [email, name] of people) {
      const rendered = templates.boardClosed(
        board,
        name,
        office.to,
        office.cc,
        examPeriod(env),
      );
      await dispatch(env, rendered, { to: email, cc: office.cc });
    }
  });
}
