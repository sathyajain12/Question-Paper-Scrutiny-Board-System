/**
 * Tab 3 — Admin Portal.
 *
 * Summary counts + the board table with inline actions: approve, reject with
 * a reason, offer session dates, send appointment emails once locked.
 *
 * Every mutation sends the board's `version`; on 409 the client refetches and
 * tells the user someone else moved first (docs §7).
 */
export default function AdminPage() {
  return (
    <div>
      <h2 className="text-lg font-bold text-brand-600">Admin Portal</h2>
      {/* TODO Phase 2: SummaryCards + BoardTable. Phase 3: inline actions. */}
    </div>
  );
}
