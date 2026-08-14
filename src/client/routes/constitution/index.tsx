/**
 * Tab 1 — QPSB Constitution (HoD).
 *
 * Per board: select 2–3 faculty and submit; view rejection feedback and
 * resubmit; once approved, pick session date(s) + one start time to lock.
 *
 * Components to build here (Phase 2 read-only, Phase 3 writes):
 *   BoardCard · StatusBadge · FacultyPicker · SessionDatePicker
 */
export default function ConstitutionPage() {
  return (
    <div>
      <h2 className="text-lg font-bold text-brand-600">QPSB Constitution</h2>
      <p className="mt-4 rounded border-l-4 border-brand-500 bg-brand-50 p-4 text-sm">
        Heads of Departments must not nominate any faculty member who has
        relatives (wards) currently enrolled as students in the same academic
        programme for which the QPSB is being constituted.
      </p>
      {/* TODO Phase 2: useQuery(queryKeys.boards) → BoardCard list */}
    </div>
  );
}
