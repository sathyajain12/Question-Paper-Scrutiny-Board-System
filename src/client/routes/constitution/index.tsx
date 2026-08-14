/**
 * Tab 1 — QPSB Constitution (HoD).
 *
 * Per board: select 2–3 faculty and submit; view rejection feedback and
 * resubmit; once approved, pick session date(s) + one start time to lock.
 */
import { BoardCard } from '@/components/board/BoardCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useBoards } from '@/lib/hooks';

export default function ConstitutionPage() {
  const { data, isPending, error } = useBoards();

  return (
    <div>
      <h2 className="text-lg font-bold text-brand-600">QPSB Constitution</h2>

      <p className="mt-3 rounded-md border-l-4 border-brand-500 bg-brand-50 px-4 py-3 text-sm text-slate-700">
        Heads of Departments must not nominate any faculty member who has
        relatives (wards) currently enrolled as students in the same academic
        programme for which the QPSB is being constituted.
      </p>

      <div className="mt-6 space-y-4">
        {isPending && <LoadingState label="Loading your boards…" />}
        {error && <ErrorState error={error} />}

        {data?.boards.length === 0 && (
          <EmptyState
            title="No programmes found"
            hint="No academic programmes are assigned to your department(s)."
          />
        )}

        {data?.boards.map((summary) => (
          <BoardCard key={summary.boardId} summary={summary} />
        ))}
      </div>
    </div>
  );
}
