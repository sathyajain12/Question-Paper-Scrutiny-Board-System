import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ActiveNomination, FacultyMember } from '@shared/types';
import { checkActiveNominations } from '@/lib/hooks';
import { Button } from '../ui/Button';

/**
 * The reveal shown when an admin clicks Exclude — one member for a single
 * row, several for a bulk action. Shared so the on-demand active-nomination
 * check and the reason input only exist in one place.
 *
 * No confirm() dialog: matches how Reject and Close Board already do this
 * inline elsewhere in the app, and it's the only place in this screen an
 * admin action isn't instantly reversible-by-one-click, so it earns the
 * extra step that Restore/Remove deliberately skip.
 */
export function ExcludeConfirmPanel({
  department,
  members,
  busy,
  onCancel,
  onConfirm,
}: {
  department: string;
  members: FacultyMember[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [checking, setChecking] = useState(true);
  const [warnings, setWarnings] = useState<
    { member: FacultyMember; nominations: ActiveNomination[] }[]
  >([]);

  useEffect(() => {
    let cancelled = false;

    setChecking(true);
    Promise.all(
      members.map(async (member) => ({
        member,
        nominations: (await checkActiveNominations(department, member.email)).nominations,
      })),
    )
      .then((results) => {
        if (cancelled) return;
        setWarnings(results.filter((r) => r.nominations.length > 0));
        setChecking(false);
      })
      .catch(() => {
        // A failed check shouldn't block excluding — just skip the warning.
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
    // Deliberately keyed on the joined email list, not `members` itself —
    // a fresh array identity every render would re-check on every keystroke
    // in the reason field below.
  }, [department, members.map((m) => m.email).join(',')]);

  return (
    <div className="space-y-3 rounded-lg bg-red-50 p-3 ring-1 ring-inset ring-red-200">
      {checking && (
        <p className="text-xs text-red-700">Checking current nominations…</p>
      )}

      {!checking && warnings.length > 0 && (
        <div className="flex gap-2 rounded-md bg-amber-50 p-2.5 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <ul className="space-y-1">
            {warnings.map(({ member, nominations }) => (
              <li key={member.email}>
                <strong>{member.name}</strong> is currently nominated on{' '}
                {nominations
                  .map((n) => `${n.programme} (${n.status})`)
                  .join(', ')}
                . Excluding won&rsquo;t remove them from{' '}
                {nominations.length > 1 ? 'these boards' : 'this board'}.
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="block text-xs font-semibold text-red-900">
        Reason (optional)
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="e.g. ward enrolled in this programme, visiting faculty on leave…"
          className="mt-1 w-full rounded-md border border-red-300 px-2 py-1.5 text-sm font-normal text-slate-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none"
        />
      </label>

      <div className="flex gap-2">
        <Button variant="danger" loading={busy} onClick={() => onConfirm(reason.trim())}>
          {members.length > 1 ? `Exclude ${members.length} selected` : 'Confirm exclude'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
