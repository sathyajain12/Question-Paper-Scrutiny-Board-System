/**
 * Tab 2 — QPSB File Checker.
 *
 * Admin: cascading degree → department → programme, plus pre/post toggle.
 * HoD:   own programmes only, post-check only.
 *
 * The matrix is a TanStack Table over CheckResult.rows, with columns derived
 * from foldersFor(checkType) so a folder rename is a one-line change.
 */
export default function FileCheckerPage() {
  return (
    <div>
      <h2 className="text-lg font-bold text-brand-600">QPSB File Checker</h2>
      {/* TODO Phase 4: selectors → useQuery(queryKeys.check(...)) → CheckMatrix */}
    </div>
  );
}
