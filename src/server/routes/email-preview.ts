/**
 * Email preview — development only.
 *
 * Board notifications are hard to review: each one needs a board in exactly
 * the right state, and the dev-mode mailer only logs the plain-text part, so
 * the HTML nobody can see is the half that actually gets read. This renders
 * every template against a fixed sample board, on demand.
 *
 * Mounted before `requireSession` and gated on DEV_MODE — see index.ts. The
 * sample board is defined here rather than read from the repository so the
 * preview does not drift as fixtures are mutated by testing.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import type { BoardDetail, FacultyMember } from '@shared/types';
import * as templates from '../notifications/templates';

const preview = new Hono<Env>();

const member = (
  email: string,
  name: string,
  campus = 'Prasanthi Nilayam',
): FacultyMember => ({ email, name, campus, department: 'Mathematics' });

const CHAIR = member('math1@sssihl.edu.in', 'Dr. R. Krishnan');

const SAMPLE_BOARD: BoardDetail = {
  boardId: 'bsc-mathematics-2026',
  degree: 'Bachelor of Science',
  degreeShort: 'B.Sc.',
  department: 'Mathematics',
  programme: 'B.Sc. Mathematics (Hons.)',
  status: 'Locked',
  courseCount: 4,
  submittedBy: 'math1@sssihl.edu.in',
  submittedAt: '2026-08-14T09:15:00Z',
  members: [
    member('math2@sssihl.edu.in', 'Dr. S. Venkataraman'),
    member('math3@sssihl.edu.in', 'Dr. A. Narayan', 'Brindavan'),
  ],
  availableDates: [
    { date: '2026-09-02', isSelected: true },
    { date: '2026-09-03', isSelected: true },
    { date: '2026-09-07', isSelected: false },
  ],
  sessionTime: '9:30 AM',
  changesRequested: false,
  filesCompleteAt: null,
  closed: false,
  version: 7,
  chairperson: CHAIR,
  courses: [],
  actionBy: 'coe@sssihl.edu.in',
  actionAt: '2026-08-15T05:30:00Z',
  rejectionReason: null,
};

const PORTAL = 'https://qpsb.sssihl.edu.in';
const PERIOD = 'April 2026';
const OFFICE = 'eddrsmaster@sssihl.edu.in';
const OFFICE_CC = ['controller@sssihl.edu.in', 'dycontroller@sssihl.edu.in'];

const SELECTED = SAMPLE_BOARD.availableDates
  .filter((d) => d.isSelected)
  .map((d) => d.date);

interface PreviewEntry {
  slug: string;
  label: string;
  /** Who really receives it, so the preview shows the addressing too. */
  audience: string;
  render: () => templates.RenderedEmail;
}

const ENTRIES: PreviewEntry[] = [
  {
    slug: 'board-submitted',
    label: 'Constitution submitted',
    audience: 'Office (EDDRS, Controller, Dy. Controller copied)',
    render: () =>
      templates.boardSubmitted(SAMPLE_BOARD, 'Dr. R. Krishnan', PORTAL, PERIOD),
  },
  {
    slug: 'board-approved',
    label: 'Constitution approved',
    audience: 'HoD',
    render: () => templates.boardApproved(SAMPLE_BOARD, 'Dr. R. Krishnan', PERIOD),
  },
  {
    slug: 'board-rejected',
    label: 'Returned for revision',
    audience: 'HoD',
    render: () =>
      templates.boardRejected(
        SAMPLE_BOARD,
        'Dr. R. Krishnan',
        'Two of the nominated members are from the same campus as the paper setter. Please nominate a member from another campus.',
        PORTAL,
        PERIOD,
      ),
  },
  {
    slug: 'dates-offered',
    label: 'Session dates available',
    audience: 'HoD',
    render: () =>
      templates.datesOffered(
        SAMPLE_BOARD,
        'Dr. R. Krishnan',
        ['2026-09-02', '2026-09-03', '2026-09-07'],
        PORTAL,
        PERIOD,
      ),
  },
  {
    slug: 'schedule-confirmed',
    label: 'Session date confirmed',
    audience: 'Office',
    render: () =>
      templates.scheduleConfirmed(
        SAMPLE_BOARD,
        'Dr. R. Krishnan',
        SELECTED,
        '9:30 AM',
        PORTAL,
        PERIOD,
      ),
  },
  {
    slug: 'appointment',
    label: 'Appointment letter',
    audience: 'Chairperson, with members copied',
    render: () =>
      templates.appointmentLetter(
        SAMPLE_BOARD,
        CHAIR.name,
        SAMPLE_BOARD.members,
        SELECTED,
        '9:30 AM',
        PERIOD,
      ),
  },
  {
    slug: 'changes-requested',
    label: 'Changes required',
    audience: 'HoD',
    render: () =>
      templates.changesRequested(SAMPLE_BOARD, 'Dr. R. Krishnan', PORTAL, PERIOD),
  },
  {
    slug: 'changes-incorporated',
    label: 'Changes incorporated',
    audience: 'Office',
    render: () =>
      templates.changesIncorporated(SAMPLE_BOARD, 'Dr. R. Krishnan', PORTAL, PERIOD),
  },
  {
    slug: 'files-complete',
    label: 'QPSB work completed',
    audience: 'Office',
    render: () =>
      templates.filesComplete(SAMPLE_BOARD, 'Dr. R. Krishnan', PORTAL, PERIOD),
  },
  {
    slug: 'board-closed',
    label: 'Board closed — destruction acknowledgement',
    audience: 'Chairperson and each member, sent individually',
    render: () =>
      templates.boardClosed(SAMPLE_BOARD, 'Dr. R. Krishnan', OFFICE, OFFICE_CC, PERIOD),
  },
];

/**
 * A contact sheet: every email inline, at the width a mail client gives it.
 * Iframes rather than inlined markup, so one template's styles cannot leak
 * into another and each is previewed exactly as it will be delivered.
 */
preview.get('/', (c) => {
  const cards = ENTRIES.map((entry) => {
    const { subject } = entry.render();
    return (
      `<section class="card">` +
      `<header>` +
      `<h2>${templates.escapeHtml(entry.label)}</h2>` +
      `<p class="subject">${templates.escapeHtml(subject)}</p>` +
      `<p class="audience">To: ${templates.escapeHtml(entry.audience)}</p>` +
      `<p class="links">` +
      `<a href="/api/dev/emails/${entry.slug}" target="_blank" rel="noreferrer">Open HTML</a>` +
      ` · ` +
      `<a href="/api/dev/emails/${entry.slug}?format=text" target="_blank" rel="noreferrer">Plain text</a>` +
      `</p>` +
      `</header>` +
      `<iframe src="/api/dev/emails/${entry.slug}" title="${templates.escapeHtml(entry.label)}" loading="lazy"></iframe>` +
      `</section>`
    );
  }).join('');

  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>QPSB email preview</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 24px; background: #eef2f7; font: 14px/1.5 system-ui, sans-serif; color: #1e293b; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  .lede { margin: 0 0 24px; color: #64748b; max-width: 70ch; }
  .grid { display: grid; gap: 20px; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); }
  .card { background: #fff; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; }
  .card header { padding: 12px 14px; border-bottom: 1px solid #e2e8f0; }
  .card h2 { margin: 0 0 4px; font-size: 14px; }
  .subject { margin: 0; font-size: 12px; color: #0c5196; font-weight: 600; word-break: break-word; }
  .audience { margin: 4px 0 0; font-size: 11px; color: #64748b; }
  .links { margin: 8px 0 0; font-size: 11px; }
  .links a { color: #0c5196; }
  iframe { width: 100%; height: 520px; border: 0; display: block; background: #f0f4fa; }
</style>
</head>
<body>
  <h1>QPSB email preview</h1>
  <p class="lede">
    Every board notification rendered against one sample board (B.Sc. Mathematics,
    Locked, two members, two confirmed dates). Development only &mdash; this route
    is not mounted when <code>DEV_MODE</code> is off.
  </p>
  <div class="grid">${cards}</div>
</body>
</html>`;

  return c.html(page);
});

preview.get('/:slug', (c) => {
  const entry = ENTRIES.find((e) => e.slug === c.req.param('slug'));
  if (!entry) return c.json({ error: 'Unknown email' }, 404);

  const rendered = entry.render();
  if (c.req.query('format') === 'text') {
    return c.text(`Subject: ${rendered.subject}\n\n${rendered.text}`);
  }
  return c.html(rendered.html);
});

export default preview;
