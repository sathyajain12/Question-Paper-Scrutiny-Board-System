/**
 * A thin Google Sheets v4 client.
 *
 * Only what the repository needs, built on `fetch` — the `googleapis` SDK is
 * Node-only and cannot run on Workers. Everything above this speaks in rows
 * and never sees a URL.
 *
 * Reads go through `batchGet`, which is the whole performance story: the
 * repository needs seven tabs to answer "show me the boards", and seven
 * round trips at ~150 ms each is a second of latency for data that fits in
 * one response. Quotas reinforce it — 300 reads/min/project, 60/min/user.
 */
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

/** A tab's contents as rows of raw cell strings, header row included. */
export type SheetRows = string[][];

interface BatchGetResponse {
  valueRanges?: { range?: string; values?: string[][] }[];
}

interface ApiError {
  error?: { message?: string; status?: string };
}

async function failure(res: Response, what: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as ApiError;
  const detail = body.error?.message ?? `HTTP ${res.status}`;

  // 403 here is nearly always the same mistake, and the generic message
  // ("The caller does not have permission") sends people hunting through
  // OAuth scopes instead of the sharing dialog.
  if (res.status === 403) {
    throw new Error(
      `${what} was refused: ${detail}. Check the workbook is shared with the service account as an Editor.`,
    );
  }
  throw new Error(`${what} failed: ${detail}`);
}

/**
 * Reads several ranges in one call. Ranges are A1 notation — a bare tab name
 * means the whole tab.
 *
 * Returns a map keyed by the range you asked for, not the range Google echoes
 * back: it normalises `Access` to `Access!A1:C27`, and callers should not have
 * to care.
 */
export async function batchGet(
  spreadsheetId: string,
  accessToken: string,
  ranges: string[],
): Promise<Record<string, SheetRows>> {
  if (ranges.length === 0) return {};

  const url = new URL(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchGet`);
  for (const range of ranges) url.searchParams.append('ranges', range);
  // Formatted values render dates the way the sheet displays them, which is
  // what the old portal's packed strings assume.
  url.searchParams.set('valueRenderOption', 'FORMATTED_VALUE');
  url.searchParams.set('majorDimension', 'ROWS');

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) await failure(res, `Reading ${ranges.join(', ')}`);

  const body = (await res.json()) as BatchGetResponse;
  const out: Record<string, SheetRows> = {};

  // Google returns valueRanges in the order the ranges were requested, so
  // the index is the join — the echoed `range` string is normalised and no
  // longer matches what the caller asked for.
  (body.valueRanges ?? []).forEach((valueRange, index) => {
    const requested = ranges[index];
    if (requested === undefined) return;
    out[requested] = valueRange.values ?? [];
  });

  return out;
}

export async function readRange(
  spreadsheetId: string,
  accessToken: string,
  range: string,
): Promise<SheetRows> {
  const result = await batchGet(spreadsheetId, accessToken, [range]);
  return result[range] ?? [];
}

/** Appends rows to the end of a tab. */
export async function appendRows(
  spreadsheetId: string,
  accessToken: string,
  range: string,
  rows: SheetRows,
): Promise<void> {
  if (rows.length === 0) return;

  const url = new URL(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append`,
  );
  url.searchParams.set('valueInputOption', 'RAW');
  url.searchParams.set('insertDataOption', 'INSERT_ROWS');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: rows }),
  });

  if (!res.ok) await failure(res, `Appending to ${range}`);
}

/** Overwrites a range. The caller supplies an A1 range sized to the rows. */
export async function updateRange(
  spreadsheetId: string,
  accessToken: string,
  range: string,
  rows: SheetRows,
): Promise<void> {
  const url = new URL(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
  );
  url.searchParams.set('valueInputOption', 'RAW');

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: rows }),
  });

  if (!res.ok) await failure(res, `Updating ${range}`);
}

// ── Header-driven row access ─────────────────────────────────────────

/**
 * Turns a tab into objects keyed by its header row.
 *
 * Column names are matched case-insensitively with punctuation stripped, so
 * `Regd. No.`, `regd no` and `RegdNo` all resolve. That tolerance is
 * deliberate: the Apps Script portal broke twice on header cells that looked
 * identical but weren't — one had a trailing space, another an embedded line
 * break — and a sheet maintained by hand will drift like that again.
 */
export function normaliseKey(header: string): string {
  return header.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export interface TabReader {
  /** Zero-based index within the data rows, excluding the header. */
  rows: Record<string, string>[];
  /** 1-based sheet row number for the nth data row, for building A1 ranges. */
  sheetRowFor(index: number): number;
  has(column: string): boolean;
}

export function readTab(rows: SheetRows): TabReader {
  const headerRow = rows[0];
  if (!headerRow) {
    return { rows: [], sheetRowFor: (i) => i + 2, has: () => false };
  }

  const header = headerRow.map(normaliseKey);
  const present = new Set(header);

  const objects = rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    header.forEach((key, column) => {
      if (!key) return;
      const value = row[column];
      record[key] = value === undefined || value === null ? '' : String(value).trim();
    });
    return record;
  });

  return {
    rows: objects,
    // +1 for the header, +1 because sheet rows are 1-based.
    sheetRowFor: (index) => index + 2,
    has: (column) => present.has(normaliseKey(column)),
  };
}
