/**
 * FAQ content for the HoD help widget — a static, hand-curated Q&A set, not
 * a live AI chatbot (no LLM binding exists anywhere in this stack). Follows
 * the same pattern as folder-spec.ts: a plain shared constant, imported
 * directly by the client, with no API round trip.
 *
 * Adapted from docs/HOD-GUIDE.md (the institution's canonical guide), with
 * four deliberate departures from that document to match this build's
 * actual current behaviour rather than the guide's fuller/legacy
 * description — each is called out below where it applies:
 *
 *   1. The final status badge here reads "Scheduled", not "Locked".
 *   2. The File Checker has no "Check Files" button — selecting a
 *      programme runs the check automatically.
 *   3. The check matrix has four columns, not five — there is no
 *      "Blueprint Confirmed" column in this build yet.
 *   4. "Download Full QPSB Folder" is not implemented yet, so it is
 *      omitted entirely rather than described.
 */

export interface FaqEntry {
  id: string;
  category: string;
  question: string;
  answer: string;
  /** Extra search terms beyond words already in the question. */
  keywords: string[];
}

export const FAQ_ENTRIES: FaqEntry[] = [
  // ── Getting started ──────────────────────────────────────────────────
  {
    id: 'access-denied',
    category: 'Getting Started',
    question: 'I see "Access Denied" when I open the portal — what do I do?',
    answer:
      'Your email is not yet mapped in the system. Contact the COE office and give them the exact email address shown on the Access Denied screen.',
    keywords: ['login', 'sign in', 'denied', 'unauthorized', 'access'],
  },
  {
    id: 'multiple-programmes',
    category: 'Getting Started',
    question: "I'm responsible for two programmes — will I see two cards?",
    answer:
      'Yes. One card appears per department–degree combination you head. Each card is handled completely independently — submitting or approving one has no effect on the others.',
    keywords: ['two departments', 'multiple boards', 'several programmes', 'dean'],
  },
  {
    id: 'course-list',
    category: 'Getting Started',
    question: 'How do I see the full list of courses this board covers?',
    answer:
      'Click the "N courses" chip next to the department name on the card to expand the course codes and titles. Check it is correct before nominating anyone — raise any missing or wrong course with the COE office first.',
    keywords: ['courses', 'course list', 'chip', 'expand'],
  },

  // ── Board constitution ───────────────────────────────────────────────
  {
    id: 'how-many-faculty',
    category: 'Board Constitution',
    question: 'How many faculty members do I need to nominate?',
    answer:
      '2 or 3 senior faculty members per academic programme, from the Faculty Members list. You are automatically the Chairperson and are not selected or counted toward this limit.',
    keywords: ['members', 'nominate', 'select', 'how many', '2 or 3', 'board size'],
  },
  {
    id: 'checkbox-greyed-out',
    category: 'Board Constitution',
    question: "Why did the faculty checkboxes grey out after I picked a few?",
    answer:
      'The system caps nominations at 3. Once three are ticked, the remaining boxes grey out — untick one to change your choice. The counter above the list shows how many you have selected.',
    keywords: ['disabled', 'grey', 'maximum', 'limit', 'cap'],
  },
  {
    id: 'ward-conflict',
    category: 'Board Constitution',
    question: "What's the conflict-of-interest / ward rule?",
    answer:
      'Never nominate a faculty member who has a relative or ward currently enrolled as a student in the same academic programme this QPSB is being constituted for. The system cannot check this for you — confirm it deliberately for each name before ticking the box.',
    keywords: ['ward', 'conflict of interest', 'relative', 'disclaimer', 'nepotism'],
  },
  {
    id: 'faculty-missing',
    category: 'Board Constitution',
    question: "A faculty member I need isn't in the list, or someone who shouldn't be eligible is showing.",
    answer:
      "Don't work around it — contact the COE office. They can add or exclude faculty for your department, and the change appears in your list immediately on reload.",
    keywords: ['missing faculty', 'not in list', 'exclude', 'visiting faculty', 'wrong person'],
  },
  {
    id: 'edit-after-submit',
    category: 'Board Constitution',
    question: 'Can I edit my constitution after I submit it?',
    answer:
      "No — once submitted, a card can't be edited while it's under review. This is intentional. If something needs to change, ask the COE office to return it to you, or wait for it to come back as Rejected with a reason.",
    keywords: ['edit', 'change', 'modify', 'undo submission'],
  },

  // ── Status & approval ────────────────────────────────────────────────
  {
    id: 'status-badges',
    category: 'Status & Approval',
    question: 'What does each status badge mean?',
    answer:
      'Not Submitted: board not yet constituted — nominate and submit. Submitted: awaiting COE approval — nothing to do. Rejected: the admin asked for a revision — read the reason, revise, and resubmit. Approved: constitution accepted — wait for session dates. Scheduled: constitution and session date/time are both final — nothing further to do on this tab.',
    keywords: ['badge', 'status', 'not submitted', 'approved', 'rejected', 'scheduled', 'locked'],
  },
  {
    id: 'rejected-what-now',
    category: 'Status & Approval',
    question: 'My constitution was rejected — what now?',
    answer:
      'The card shows a "Modifications required" message with the reason, followed by the selection form again with your earlier choices already ticked. Adjust what the reason asks for and submit again — there is no limit on resubmissions.',
    keywords: ['rejected', 'modifications required', 'resubmit', 'revise'],
  },

  // ── Scheduling ───────────────────────────────────────────────────────
  {
    id: 'confirm-date',
    category: 'Scheduling',
    question: 'How do I confirm the QPSB session date?',
    answer:
      'Once the COE administrator publishes available dates, tick every date your board can convene on (you may tick more than one), pick one commencement time — it applies to every date you ticked — then click "Confirm date & time".',
    keywords: ['session date', 'schedule', 'confirm', 'time', 'commencement'],
  },
  {
    id: 'different-time-per-date',
    category: 'Scheduling',
    question: 'Can I set a different time for each date?',
    answer:
      "No — one commencement time applies to every date you've ticked. If your board genuinely needs different times on different days, contact the COE office.",
    keywords: ['different time', 'per date', 'multiple times'],
  },
  {
    id: 'change-confirmed-date',
    category: 'Scheduling',
    question: 'I confirmed the wrong date or time — can I change it?',
    answer:
      "Not from your side once it's Scheduled. Ask the COE administrator to re-open date selection — they'll issue a fresh set of dates and the card returns to you for a new choice.",
    keywords: ['wrong date', 'change schedule', 're-open', 'mistake'],
  },

  // ── File checker ─────────────────────────────────────────────────────
  {
    id: 'check-runs-automatically',
    category: 'File Checker',
    question: 'How do I run the file check?',
    answer:
      "Go to the File Checker tab and select your programme from the dropdown — the check runs automatically as soon as you pick it, there's no separate button to click. As an HoD you always see the post-QPSB check; the pre-QPSB check is an administrator-only function.",
    keywords: ['check files', 'run check', 'file checker', 'how to check'],
  },
  {
    id: 'check-columns',
    category: 'File Checker',
    question: 'What do the File Checker columns mean?',
    answer:
      'Word Track: the scrutinised question paper in Word with tracked changes. Scrutinised Synopsis: the final synopsis after board scrutiny. Word Master: the clean, accepted master copy. PDF Master: the final PDF generated from the Word master. Every course must show green in all four columns before the work is complete.',
    keywords: ['columns', 'word track', 'synopsis', 'word master', 'pdf master', 'green', 'red'],
  },
  {
    id: 'missing-file',
    category: 'File Checker',
    question: 'A course shows red or missing — what do I do?',
    answer:
      'Open the folder link above the results table, upload whatever is missing, then re-select the programme (or reload) to re-run the check and confirm it turns green.',
    keywords: ['missing', 'red', 'not found', 'fix files', 're-check'],
  },

  // ── Notify buttons ───────────────────────────────────────────────────
  {
    id: 'work-done-notify',
    category: 'Notify Buttons',
    question: 'When do I click "Work Done — Notify Admin"?',
    answer:
      'Only once — the first time every course shows green across all columns. It tells the COE office the board\'s work is finished and ready for review. The button disables itself after a successful send; it is a one-time declaration, not a status toggle.',
    keywords: ['work done', 'notify admin', 'complete', 'finished'],
  },
  {
    id: 'changes-fixed-notify',
    category: 'Notify Buttons',
    question: 'Why is "Changes Fixed — Notify Admin" greyed out?',
    answer:
      'It only becomes active after the administrator reviews your files and sends back a "changes required" notice. Fix the files, re-run the check to confirm everything is green again, and only then click it — clicking early sends a false all-clear.',
    keywords: ['changes fixed', 'greyed out', 'disabled', 'changes required'],
  },

  // ── Miscellaneous ────────────────────────────────────────────────────
  {
    id: 'same-faculty-two-boards',
    category: 'Miscellaneous',
    question: 'Can I nominate the same faculty member for two different programmes I head?',
    answer:
      'Yes — each card is independent, provided the conflict-of-interest rule holds separately for each programme.',
    keywords: ['same faculty', 'two boards', 'reuse member'],
  },
  {
    id: 'withdraw-submission',
    category: 'Miscellaneous',
    question: 'Can I withdraw a submission myself?',
    answer:
      "Not directly — ask the COE administrator to return it. You'll then get the revision form back with your original selections intact.",
    keywords: ['withdraw', 'cancel', 'undo', 'retract'],
  },
  {
    id: 'member-drops-out',
    category: 'Miscellaneous',
    question: 'A nominated member needs to drop out after the board is approved.',
    answer:
      'Contact the COE office — the administrator can add a replacement member to an approved or scheduled board without resetting the whole constitution.',
    keywords: ['drop out', 'replace member', 'unavailable', 'substitute'],
  },
  {
    id: 'page-stuck',
    category: 'Miscellaneous',
    question: 'The page is stuck on "Loading…" or nothing happens when I click.',
    answer:
      'Refresh and retry. If it persists, note the exact message shown and report it to the COE office — server-side errors are logged and can be traced.',
    keywords: ['loading', 'stuck', 'frozen', 'not working', 'error', 'bug'],
  },
];

/** Shown when nothing scores above zero. */
export const FAQ_FALLBACK: FaqEntry = {
  id: 'fallback-contact',
  category: 'Contact',
  question: "I don't see my question here — who do I contact?",
  answer:
    'Write to the Controller of Examinations (COE) office — for access issues, faculty list corrections, date re-opening, or board membership changes.',
  keywords: [],
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/**
 * Interchangeable vocabulary, grouped so a HoD typing "professors" or
 * "nominees" still lands on the entry written around "faculty". Built from
 * the words that actually appear across FAQ_ENTRIES above — extend a group
 * (or add one) when a new entry introduces a term someone is likely to
 * phrase differently.
 */
const SYNONYM_GROUPS: string[][] = [
  ['faculty', 'member', 'members', 'nominee', 'nominees', 'professor', 'professors', 'staff', 'colleague', 'colleagues'],
  ['submit', 'submission', 'submitted', 'send', 'apply'],
  ['reject', 'rejected', 'rejection', 'declined', 'decline', 'returned', 'return'],
  ['approve', 'approved', 'approval', 'accept', 'accepted'],
  ['schedule', 'scheduled', 'scheduling', 'date', 'dates', 'session', 'time', 'locked', 'lock'],
  ['notify', 'notification', 'notifying', 'notified', 'tell', 'inform', 'alert'],
  ['admin', 'administrator', 'coe', 'office', 'controller', 'exam'],
  ['check', 'checker', 'checking', 'checked', 'verify', 'verification'],
  ['missing', 'absent', 'gone', 'unavailable', 'not found'],
  ['grey', 'greyed', 'gray', 'grayed', 'disabled', 'inactive', 'unclickable', 'greyedout'],
  ['folder', 'drive', 'directory'],
  ['chairperson', 'chair', 'head'],
  ['board', 'committee', 'qpsb'],
  ['ward', 'relative', 'conflict', 'nepotism', 'dependent'],
  ['resubmit', 'resubmission', 'reapply', 'revise', 'revision', 'revised'],
  ['withdraw', 'cancel', 'retract', 'undo'],
  ['close', 'closed', 'closing', 'finalize', 'finalise', 'finalized'],
  ['stuck', 'frozen', 'broken', 'error', 'bug', 'issue', 'problem'],
  ['login', 'signin', 'sign', 'access', 'denied'],
];

const CANONICAL_TOKEN = new Map<string, string>();
for (const group of SYNONYM_GROUPS) {
  for (const word of group) CANONICAL_TOKEN.set(word, group[0]!);
}

function canonicalOf(token: string): string {
  return CANONICAL_TOKEN.get(token) ?? token;
}

/** Iterative Levenshtein distance — tokens here are short, so this is cheap. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prevRow = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prevRow[0]!;
    prevRow[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prevRow[j]!;
      prevRow[j] =
        a[i - 1] === b[j - 1]
          ? diagonal
          : 1 + Math.min(diagonal, prevRow[j]!, prevRow[j - 1]!);
      diagonal = temp;
    }
  }
  return prevRow[b.length]!;
}

/** Longer tokens can absorb more of a typo before the match stops meaning anything. */
function typoBudget(length: number): number {
  if (length <= 4) return 0;
  if (length <= 7) return 1;
  return 2;
}

/**
 * How well one query token matches one entry token — exact beats a shared
 * synonym group, which beats a partial/prefix overlap, which beats a
 * same-typo-family match. 0 means unrelated.
 */
function tokenMatchStrength(queryToken: string, entryToken: string): 0 | 1 | 2 | 3 {
  if (queryToken === entryToken) return 3;
  if (canonicalOf(queryToken) === canonicalOf(entryToken)) return 2;
  if (
    queryToken.length >= 3 &&
    entryToken.length >= 3 &&
    (entryToken.includes(queryToken) || queryToken.includes(entryToken))
  ) {
    return 1;
  }
  const budget = typoBudget(Math.max(queryToken.length, entryToken.length));
  if (budget > 0 && levenshtein(queryToken, entryToken) <= budget) return 1;
  return 0;
}

interface Scored {
  entry: FaqEntry;
  score: number;
}

/**
 * Question/keyword hits count double an answer-only hit, mirroring how
 * deliberately those fields were written to carry the entry's identity.
 * Each query token contributes its single best match across the entry
 * (not summed per entry-token) so a long, repetitive answer can't inflate
 * a score just by containing many near-duplicate words.
 */
function scoreEntry(queryTokens: string[], entry: FaqEntry): number {
  const questionAndKeywordTokens = tokenize(`${entry.question} ${entry.keywords.join(' ')}`);
  const answerTokens = tokenize(entry.answer);

  let score = 0;
  for (const q of queryTokens) {
    const bestQK = Math.max(0, ...questionAndKeywordTokens.map((t) => tokenMatchStrength(q, t)));
    const bestA = Math.max(0, ...answerTokens.map((t) => tokenMatchStrength(q, t)));
    score += Math.max(bestQK * 2, bestA);
  }
  return score;
}

function scoreAll(query: string): Scored[] {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0) return [];

  return FAQ_ENTRIES.map((entry) => ({ entry, score: scoreEntry(queryTokens, entry) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** Ranked matches for `query`, best first. Empty when nothing scores. */
export function searchFaq(query: string, limit = 5): FaqEntry[] {
  return scoreAll(query)
    .slice(0, limit)
    .map((s) => s.entry);
}

/**
 * A single top match only "wins" outright when it's clearly ahead of
 * whatever's next — otherwise a vague query (e.g. just "admin") would
 * silently commit to one of several equally-plausible entries instead of
 * letting the HoD pick the one they actually meant.
 */
const CONFIDENCE_MARGIN = 3;

export type FaqAnswer =
  | { kind: 'answer'; entry: FaqEntry }
  | { kind: 'suggestions'; entries: FaqEntry[] }
  | { kind: 'fallback' };

export function askFaq(query: string): FaqAnswer {
  const scored = scoreAll(query);
  if (scored.length === 0) return { kind: 'fallback' };

  const [top, second] = scored;
  const confident = !second || top!.score - second.score >= CONFIDENCE_MARGIN;

  return confident
    ? { kind: 'answer', entry: top!.entry }
    : { kind: 'suggestions', entries: scored.slice(0, 3).map((s) => s.entry) };
}
