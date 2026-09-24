/**
 * Email rendering for board notifications.
 *
 * Ported from the Apps Script portal's `emailHtmlWrapper` / `emailButton` /
 * `emailInfoBox` trio, keeping the visual language people already recognise:
 * the #0c5196 institute blue, a white card on a pale ground, and a coloured
 * left rule on the box that carries the decision.
 *
 * Two rules worth keeping:
 *
 * 1. **Every style is inline.** Mail clients drop `<style>` blocks, so there
 *    is no stylesheet to share and no point extracting one.
 * 2. **The text part is not a stub.** The old templates sometimes said "click
 *    the button in the HTML version", which is useless to anyone whose client
 *    renders text. Each builder below returns a `text` that stands alone.
 *
 * The header is set as type rather than the institute logo: the Apps Script
 * version inlined a base64 PNG through `getHeaderBase64()`, and dragging a
 * ~40 KB image into every message needs a decision about hosting it (see
 * docs/STATIC-ASSETS.md) that this port does not settle.
 */
import type { BoardDetail, FacultyMember } from '@shared/types';

const ACCENT = '#0c5196';
const GREEN = '#2e7d32';
const AMBER = '#b45309';
const BLUE = '#1565c0';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

// ── Primitives ───────────────────────────────────────────────────────

export function escapeHtml(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * ISO `yyyy-mm-dd` to the `dd-mm-yyyy` the institute writes. Anything that is
 * not a plain ISO date is passed through untouched rather than guessed at —
 * the old `formatDateDMY` fell through to `new Date(...)`, which quietly
 * reinterprets ambiguous strings in the runtime's timezone.
 */
export function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value.trim();
}

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** "07-03-2026 (Saturday)". The day name is dropped if the date won't parse. */
export function formatDateWithDay(value: string): string {
  const display = formatDate(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return display;

  // Built as UTC so the weekday cannot shift with the worker's timezone.
  const parsed = new Date(`${match[0]}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return display;
  return `${display} (${DAY_NAMES[parsed.getUTCDay()]})`;
}

export function button(url: string, label: string): string {
  return (
    `<a href="${url}" style="display:inline-block; padding:11px 28px; ` +
    `background-color:${ACCENT}; color:#ffffff; text-decoration:none; border-radius:5px; ` +
    `font-family:Arial,sans-serif; font-size:14px; font-weight:bold; letter-spacing:0.02em;">` +
    `${escapeHtml(label)}</a>`
  );
}

export function infoBox(contentHtml: string, color: string = ACCENT): string {
  const background =
    color === GREEN
      ? '#e8f5e9'
      : color === AMBER
        ? '#fff8e1'
        : color === BLUE
          ? '#e3f2fd'
          : '#e3f2fd';

  return (
    `<div style="background:${background}; border-left:4px solid ${color}; ` +
    `padding:12px 16px; margin:16px 0; border-radius:4px; font-size:14px;">` +
    `${contentHtml}</div>`
  );
}

/**
 * The card the body sits in. `confidential` stamps the header the way the
 * appointment letter does — that one carries the board's composition before
 * the session, so it is the one message that must not be forwarded casually.
 */
export function layout(bodyHtml: string, confidential = false): string {
  return (
    '<div style="background:#f0f4fa; padding:32px 16px; font-family:Arial,sans-serif;">' +
    '<div style="max-width:580px; margin:0 auto;">' +
    '<div style="background:#ffffff; border-radius:8px 8px 0 0; padding:22px 32px 14px; ' +
    'text-align:center; border:1px solid #d0dce8; border-bottom:none;">' +
    `<div style="color:#333; font-size:17px; font-weight:bold; line-height:1.35;">` +
    'Sri Sathya Sai Institute of Higher Learning</div>' +
    `<div style="color:${ACCENT}; font-size:12px; letter-spacing:0.08em; ` +
    'text-transform:uppercase; margin-top:4px;">Question Paper Scrutiny Board</div>' +
    (confidential
      ? '<div style="margin-top:10px; display:inline-block; font-size:11px; font-weight:bold; ' +
        'letter-spacing:0.12em; color:#000000; border:1px solid #b00020; border-radius:3px; ' +
        'padding:2px 10px;">CONFIDENTIAL</div>'
      : '') +
    '</div>' +
    '<div style="background:#ffffff; border-radius:0 0 8px 8px; padding:32px; ' +
    'border:1px solid #d0dce8; border-top:none;">' +
    bodyHtml +
    '<div style="margin-top:32px; padding-top:18px; border-top:1px solid #e8eef6; ' +
    'font-size:11px; color:#999; text-align:center;">' +
    'This is an automated message from the QPSB Portal.<br>Please do not reply to this email.' +
    '</div></div></div></div>'
  );
}

// ── Shared bits ──────────────────────────────────────────────────────

const SIGN_OFF = 'QPSB Portal';

function signOffHtml(): string {
  return `<p style="margin:24px 0 0;">Regards,<br><strong>${SIGN_OFF}</strong></p>`;
}

/** " | April 2026" when the exam period is configured, otherwise nothing. */
function periodSuffix(examPeriod: string | null): string {
  return examPeriod ? ` | ${examPeriod}` : '';
}

/**
 * The portal link, or nothing at all.
 *
 * An unconfigured deployment has a `TODO_...` placeholder in `PORTAL_URL`,
 * and a button pointing at that is worse than no button: it looks like a
 * link and goes nowhere. Both helpers collapse to an empty string, so the
 * surrounding message still reads correctly without them.
 */
function linkButton(url: string | null, label: string): string {
  if (!url) return '';
  return `<p style="margin:20px 0 8px; text-align:center;">${button(url, label)}</p>`;
}

function linkLine(url: string | null): string {
  return url ? `${url}\n\n` : '';
}

function boardLabel(board: BoardDetail): string {
  return `${board.programme} (${board.department})`;
}

/** Dates the HoD actually picked, in the order the board carries them. */
export function selectedDates(board: BoardDetail): string[] {
  return board.availableDates.filter((d) => d.isSelected).map((d) => d.date);
}

// ── Board lifecycle emails ───────────────────────────────────────────

/** HoD submits a constitution → the office. */
export function boardSubmitted(
  board: BoardDetail,
  submitterName: string,
  portalUrl: string | null,
  examPeriod: string | null,
): RenderedEmail {
  const subject = `QPSB Constitution Submitted - ${board.department}${periodSuffix(examPeriod)}`;

  const memberList = board.members.map((m) => m.name).join(', ') || '(none listed)';

  const text =
    `${submitterName} has submitted the QPSB Constitution for ${boardLabel(board)}.\n\n` +
    `Nominated members: ${memberList}\n\n` +
    `It is now awaiting review.\n\n${linkLine(portalUrl)}Regards,\n${SIGN_OFF}`;

  const html = layout(
    `<p style="margin:0 0 16px;"><strong>${escapeHtml(submitterName)}</strong> has submitted the ` +
      `QPSB Constitution for <strong>${escapeHtml(boardLabel(board))}</strong>, and it is now ` +
      'awaiting your review.</p>' +
      infoBox(
        `<strong>Nominated members:</strong><br>${board.members
          .map((m) => escapeHtml(m.name))
          .join('<br>') || '(none listed)'}`,
      ) +
      linkButton(portalUrl, 'Review Submission') +
      signOffHtml(),
  );

  return { subject, text, html };
}

/** Admin approves → the HoD who submitted. */
export function boardApproved(
  board: BoardDetail,
  hodName: string,
  examPeriod: string | null,
): RenderedEmail {
  const subject = `QPSB Constitution Approved - ${board.department}${periodSuffix(examPeriod)}`;

  const text =
    `Dear ${hodName},\n\n` +
    `The Constitution of QPSB for ${boardLabel(board)} has been approved.\n\n` +
    'The available session dates will be communicated to you shortly.\n\n' +
    `Regards,\n${SIGN_OFF}`;

  const html = layout(
    `<p style="margin:0 0 12px;">Dear <strong>${escapeHtml(hodName)}</strong>,</p>` +
      `<p style="margin:0 0 16px;">The Constitution of QPSB for ` +
      `<strong>${escapeHtml(boardLabel(board))}</strong> has been reviewed and ` +
      `<strong style="color:${GREEN};">approved</strong>.</p>` +
      infoBox(
        `<strong>Status:</strong> Approved&nbsp;&nbsp;|&nbsp;&nbsp;<strong>Programme:</strong> ${escapeHtml(board.programme)}`,
        GREEN,
      ) +
      '<p style="margin:16px 0 0;">The available session dates for conducting the QPSB ' +
      'proceedings will be communicated to you shortly.</p>' +
      signOffHtml(),
  );

  return { subject, text, html };
}

/** Admin rejects → the HoD, with the reason. */
export function boardRejected(
  board: BoardDetail,
  hodName: string,
  reason: string,
  portalUrl: string | null,
  examPeriod: string | null,
): RenderedEmail {
  const subject = `QPSB Constitution Returned for Revision - ${board.department}${periodSuffix(examPeriod)}`;

  const text =
    `Dear ${hodName},\n\n` +
    `The QPSB Constitution for ${boardLabel(board)} has been returned for revision.\n\n` +
    `Reason:\n${reason}\n\n` +
    `Please make the necessary changes and resubmit.\n\n${linkLine(portalUrl)}` +
    `Regards,\n${SIGN_OFF}`;

  const html = layout(
    `<p style="margin:0 0 12px;">Dear <strong>${escapeHtml(hodName)}</strong>,</p>` +
      `<p style="margin:0 0 16px;">The QPSB Constitution for ` +
      `<strong>${escapeHtml(boardLabel(board))}</strong> has been returned for revision. ` +
      'Please review the observation below and resubmit.</p>' +
      '<div style="font-size:12px; font-weight:bold; text-transform:uppercase; ' +
      'letter-spacing:0.05em; color:#888; margin-bottom:6px;">Reason for Return</div>' +
      infoBox(escapeHtml(reason), AMBER) +
      linkButton(portalUrl, 'Revise and Resubmit') +
      signOffHtml(),
  );

  return { subject, text, html };
}

/** Admin offers session dates → the HoD. */
export function datesOffered(
  board: BoardDetail,
  hodName: string,
  dates: string[],
  portalUrl: string | null,
  examPeriod: string | null,
): RenderedEmail {
  const subject = `QPSB Session Dates Available - ${board.department}${periodSuffix(examPeriod)}`;

  const text =
    `Dear ${hodName},\n\n` +
    `The available session dates for the QPSB for ${boardLabel(board)} have been published:\n\n` +
    dates.map((d) => `  - ${formatDateWithDay(d)}`).join('\n') +
    `\n\nPlease log in and select the most suitable date and start time.\n\n${linkLine(portalUrl)}` +
    `Regards,\n${SIGN_OFF}`;

  const html = layout(
    `<p style="margin:0 0 12px;">Dear <strong>${escapeHtml(hodName)}</strong>,</p>` +
      `<p style="margin:0 0 16px;">The available session dates for conducting the QPSB for ` +
      `<strong>${escapeHtml(boardLabel(board))}</strong> have been published on the portal.</p>` +
      '<div style="font-size:12px; font-weight:bold; text-transform:uppercase; ' +
      'letter-spacing:0.05em; color:#888; margin-bottom:6px;">Available Dates</div>' +
      infoBox(
        '<ul style="margin:8px 0; padding-left:20px;">' +
          dates
            .map(
              (d) =>
                `<li style="margin:4px 0; font-size:14px;">${escapeHtml(formatDateWithDay(d))}</li>`,
            )
            .join('') +
          '</ul>',
      ) +
      '<p style="margin:0 0 20px;">Please log in and select the most suitable date(s) and ' +
      'start time for convening the QPSB.</p>' +
      linkButton(portalUrl, 'Select Session Date') +
      signOffHtml(),
  );

  return { subject, text, html };
}

/** HoD confirms the schedule → the office. */
export function scheduleConfirmed(
  board: BoardDetail,
  hodName: string,
  dates: string[],
  time: string,
  portalUrl: string | null,
  examPeriod: string | null,
): RenderedEmail {
  const subject = `QPSB Session Date Confirmed - ${board.department}${periodSuffix(examPeriod)}`;

  const text =
    `${hodName} has confirmed the QPSB session schedule for ${boardLabel(board)}.\n\n` +
    dates.map((d) => `  - ${formatDateWithDay(d)}`).join('\n') +
    `\n\nTime: ${time}\n\n${linkLine(portalUrl)}Regards,\n${SIGN_OFF}`;

  const html = layout(
    `<p style="margin:0 0 16px;"><strong>${escapeHtml(hodName)}</strong> has confirmed the QPSB ` +
      `session schedule for <strong>${escapeHtml(boardLabel(board))}</strong>.</p>` +
      infoBox(
        '<strong>Confirmed Date(s):</strong><ul style="margin:6px 0 4px; padding-left:20px;">' +
          dates
            .map((d) => `<li style="margin:4px 0;">${escapeHtml(formatDateWithDay(d))}</li>`)
            .join('') +
          `</ul><strong>Time:</strong> ${escapeHtml(time)}`,
        GREEN,
      ) +
      linkButton(portalUrl, 'Open QPSB Portal') +
      signOffHtml(),
  );

  return { subject, text, html };
}

/**
 * The appointment letter — the formal notice to the chairperson and members
 * that the board is constituted and when it sits.
 *
 * This is the one email that reproduces the institute's own layout closely:
 * two tables, composition then logistics, because it stands in for a signed
 * memo rather than being a nudge to go and look at the portal.
 */
export function appointmentLetter(
  board: BoardDetail,
  chairpersonName: string,
  members: FacultyMember[],
  dates: string[],
  time: string,
  examPeriod: string | null,
): RenderedEmail {
  const subject = `Appointment to QPSB - ${board.department}${periodSuffix(examPeriod)}`;

  const tableStyle =
    'border-collapse:collapse; width:100%; font-size:13px; margin-bottom:20px;';
  const td = 'border:1px solid #ccc; padding:8px 12px; vertical-align:middle;';
  const tdBold = `${td} font-weight:bold;`;

  const compositionRows =
    `<tr>` +
    `<td rowspan="${1 + members.length}" style="${tdBold} text-align:center;">` +
    `${escapeHtml(board.department)}</td>` +
    `<td style="${td}">Chairperson</td>` +
    `<td style="${td}">${escapeHtml(chairpersonName)}</td>` +
    `</tr>` +
    members
      .map(
        (m) =>
          `<tr><td style="${td}">Member</td><td style="${td}">${escapeHtml(m.name)}</td></tr>`,
      )
      .join('');

  const dateCells = dates.map((d) => escapeHtml(formatDateWithDay(d))).join('<br>');

  const logistics =
    `<tr>` +
    `<td style="${tdBold}">Programme</td><td style="${td}">${escapeHtml(board.programme)}</td>` +
    `<td style="${tdBold}">No. of QPs</td><td style="${td}">${board.courseCount}</td>` +
    `</tr><tr>` +
    `<td style="${tdBold}">Date &amp; Day</td><td style="${td}">${dateCells}</td>` +
    `<td style="${tdBold}">Time</td><td style="${td}">${escapeHtml(time)}</td>` +
    `</tr><tr>` +
    `<td style="${tdBold}">Venue</td>` +
    `<td style="${td}"><strong>Quarantined Room in Respective Campus</strong></td>` +
    `<td style="${tdBold}">No. of days</td><td style="${td}">${dates.length}</td>` +
    `</tr>`;

  const text =
    'Dear Madam / Sir,\n\n' +
    `I am directed to inform you that the following ${board.degree} Question Paper ` +
    'Scrutiny Board is constituted for the examinations' +
    (examPeriod ? ` (${examPeriod})` : '') +
    '.\n\n' +
    `Department:  ${board.department}\n` +
    `Programme:   ${board.programme}\n` +
    `Chairperson: ${chairpersonName}\n` +
    `Members:     ${members.map((m) => m.name).join(', ') || '(none)'}\n\n` +
    `No. of QPs:  ${board.courseCount}\n` +
    `Date(s):     ${dates.map(formatDateWithDay).join('; ')}\n` +
    `Time:        ${time}\n` +
    'Venue:       Quarantined Room in Respective Campus\n\n' +
    'I request you kindly to attend the meeting and scrutinise the question paper(s) ' +
    '(Online Mode).\n\n' +
    `Regards,\n${SIGN_OFF}`;

  const html = layout(
    '<p style="margin:0 0 16px;">Dear Madam / Sir,</p>' +
      `<p style="margin:0 0 20px;">I am directed to inform you that the following ` +
      `<strong>${escapeHtml(board.degree)} &lsquo;Question Paper Scrutiny Board&rsquo;</strong> ` +
      'is constituted for the examinations to be held' +
      (examPeriod ? ` in <strong>${escapeHtml(examPeriod)}</strong>` : '') +
      '. The details relating to the Scrutiny Board Meeting are as follows:</p>' +
      `<table style="${tableStyle}">${compositionRows}</table>` +
      `<table style="${tableStyle}">${logistics}</table>` +
      '<p style="margin:20px 0;">I request you kindly to attend the meeting and scrutinise ' +
      'the question paper(s) <strong>(Online Mode)</strong>.</p>' +
      `<p style="margin:0;">Regards,<br><strong>${SIGN_OFF}</strong></p>`,
    true,
  );

  return { subject, text, html };
}

/** Admin flags the post-QPSB files for correction → the HoD. */
export function changesRequested(
  board: BoardDetail,
  hodName: string,
  portalUrl: string | null,
  examPeriod: string | null,
): RenderedEmail {
  const subject = `QPSB - Changes Required - ${board.department}${periodSuffix(examPeriod)}`;

  const text =
    `Dear ${hodName},\n\n` +
    `Changes are required in the post-QPSB files for ${boardLabel(board)}.\n\n` +
    'Please review the change document in the board folder, incorporate the changes, ' +
    `and confirm through the portal.\n\n${linkLine(portalUrl)}Regards,\n${SIGN_OFF}`;

  const html = layout(
    `<p style="margin:0 0 12px;">Dear <strong>${escapeHtml(hodName)}</strong>,</p>` +
      `<p style="margin:0 0 16px;">Changes are required in the post-QPSB files for ` +
      `<strong>${escapeHtml(boardLabel(board))}</strong>.</p>` +
      infoBox(
        `<strong>Programme:</strong> ${escapeHtml(board.programme)}<br>` +
          'Please check the change document in the board folder for the details.',
        AMBER,
      ) +
      '<p style="margin:16px 0 0;">Once the changes have been incorporated, please confirm ' +
      'through the portal so the office is notified.</p>' +
      linkButton(portalUrl, 'Open QPSB Portal') +
      signOffHtml(),
  );

  return { subject, text, html };
}

/** HoD confirms the corrections are done → the office. */
export function changesIncorporated(
  board: BoardDetail,
  hodName: string,
  portalUrl: string | null,
  examPeriod: string | null,
): RenderedEmail {
  const subject = `Changes Incorporated - ${board.department}${periodSuffix(examPeriod)}`;

  const text =
    `${hodName} has confirmed that the required changes have been incorporated for ` +
    `${boardLabel(board)}.\n\n${linkLine(portalUrl)}Regards,\n${SIGN_OFF}`;

  const html = layout(
    `<p style="margin:0 0 16px;"><strong>${escapeHtml(hodName)}</strong> has confirmed that the ` +
      `required changes have been incorporated for ` +
      `<strong>${escapeHtml(boardLabel(board))}</strong>.</p>` +
      infoBox(`<strong>Programme:</strong> ${escapeHtml(board.programme)}`, GREEN) +
      linkButton(portalUrl, 'Open QPSB Portal') +
      signOffHtml(),
  );

  return { subject, text, html };
}

/** HoD signals the post-QPSB files are complete → the office. */
export function filesComplete(
  board: BoardDetail,
  hodName: string,
  portalUrl: string | null,
  examPeriod: string | null,
): RenderedEmail {
  const subject = `QPSB Work Completed - ${board.department}${periodSuffix(examPeriod)}`;

  const text =
    `${hodName} has confirmed that all QPSB work has been completed for ` +
    `${boardLabel(board)}. The folder is ready for review.\n\n${linkLine(portalUrl)}` +
    `Regards,\n${SIGN_OFF}`;

  const html = layout(
    `<p style="margin:0 0 16px;"><strong>${escapeHtml(hodName)}</strong> has confirmed that all ` +
      `QPSB work has been completed for <strong>${escapeHtml(boardLabel(board))}</strong>. ` +
      'The folder is ready for your review.</p>' +
      infoBox(
        `<strong>Programme:</strong> ${escapeHtml(board.programme)}<br>` +
          `<strong>Degree:</strong> ${escapeHtml(board.degree)}`,
        GREEN,
      ) +
      linkButton(portalUrl, 'Open QPSB Portal') +
      signOffHtml(),
  );

  return { subject, text, html };
}

/**
 * Board closed → the chairperson and every member.
 *
 * Carries a `mailto:` that pre-fills the destruction acknowledgement, which
 * is the one thing the recipient has to send back. The portal cannot send it
 * for them: the acknowledgement has to come from their own mailbox to mean
 * anything, so the link opens their client with the wording already in place.
 */
export function boardClosed(
  board: BoardDetail,
  recipientName: string,
  acknowledgementTo: string,
  acknowledgementCc: string[],
  examPeriod: string | null,
): RenderedEmail {
  const subject =
    'Confirmation of Destruction of Materials and Deletion of Files - ' +
    `${board.department}${periodSuffix(examPeriod)}`;

  const ackBody =
    'Dear Sir,\n\n' +
    `With reference to the Question Paper Scrutiny Board for ${board.department}` +
    (examPeriod ? ` (${examPeriod})` : '') +
    ':\n\n' +
    '1. All the review printouts / rough materials / all the waste materials relating to ' +
    'the above board are completely destroyed.\n\n' +
    '2. All the files pertaining to the above board and downloaded off the QPSB system are ' +
    'permanently deleted, including from the Recycle Bin.\n\n' +
    'Regards,';

  const mailto =
    `mailto:${encodeURIComponent(acknowledgementTo)}` +
    `?cc=${encodeURIComponent(acknowledgementCc.join(','))}` +
    `&subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(ackBody)}`;

  const text =
    `Dear ${recipientName},\n\n` +
    `The QPSB proceedings for ${boardLabel(board)} are complete and access to the board ` +
    'folder has been withdrawn.\n\n' +
    'Kindly send your acknowledgement of destruction and deletion by replying to ' +
    `${acknowledgementTo}` +
    (acknowledgementCc.length ? ` (copy to ${acknowledgementCc.join(', ')})` : '') +
    ' with the following:\n\n' +
    ackBody +
    '\n\nIf you have already sent this acknowledgement, kindly ignore this email.\n\n' +
    `Regards,\n${SIGN_OFF}`;

  const html = layout(
    `<p style="margin:0 0 12px;">Dear <strong>${escapeHtml(recipientName)}</strong>,</p>` +
      `<p style="margin:0 0 20px;">The QPSB proceedings for ` +
      `<strong>${escapeHtml(boardLabel(board))}</strong> are complete and access to the board ` +
      'folder has been withdrawn. Kindly send your acknowledgement for the destruction of ' +
      'materials and deletion of files by clicking below.</p>' +
      `<p style="margin:0 0 8px; text-align:center;">` +
      `<a href="${mailto}" style="display:inline-block; padding:11px 28px; ` +
      `background-color:${BLUE}; color:#ffffff; text-decoration:none; border-radius:5px; ` +
      'font-family:Arial,sans-serif; font-size:14px; font-weight:bold;">' +
      'Send Acknowledgement</a></p>' +
      '<p style="margin:8px 0 0; font-size:11px; color:#888; text-align:center;">' +
      'This opens your email client with all the details pre-filled.</p>' +
      '<p style="margin:16px 0 0; font-size:12px; color:#888; font-style:italic; ' +
      'text-align:center;">If you have already sent the acknowledgement, kindly ignore this ' +
      'email.</p>' +
      signOffHtml(),
    true,
  );

  return { subject, text, html };
}
