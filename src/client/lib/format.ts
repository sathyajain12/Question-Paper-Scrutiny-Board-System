/**
 * Date/text formatting — ONE copy.
 *
 * The old portal defined formatDateDMY and formatDateTimeDisplay three times
 * across three <script> blocks, and the admin table rendered raw
 * "2026-09-14 | 9:30 AM;…" while the HoD view formatted it (docs §11 items 1-2).
 */

/** 2026-09-14 → 14-09-2026 */
export function formatDateDMY(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}-${m}-${y}` : iso;
}

/** 2026-09-14 → 14 Sep 2026 (Mon) */
export function formatDateLong(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    weekday: 'short',
  }).format(date);
}

/**
 * Renders a scheduled session. All dates share one start time, so show the
 * time once rather than repeating it per date.
 */
export function formatSession(dates: string[], time: string | null): string {
  if (dates.length === 0) return '—';
  const formatted = dates.map(formatDateDMY).join(' · ');
  return time ? `${formatted} at ${time}` : formatted;
}
