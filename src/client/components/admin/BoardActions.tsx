import { useState } from 'react';
import type { BoardDetail } from '@shared/types';
import { useApproveBoard, useOfferDates, useRejectBoard } from '@/lib/hooks';
import { Button } from '../ui/Button';
import { ErrorState } from '../ui/states';

/**
 * Inline actions for one board row. Which controls appear is driven by the
 * board's status, matching the transition table in shared/domain/board-state.
 */
export function BoardActions({ board }: { board: BoardDetail }) {
  switch (board.status) {
    case 'Submitted':
      return <ApproveOrReject board={board} />;
    case 'Approved':
      return <OfferDates board={board} />;
    case 'Locked':
      return (
        <Button variant="secondary" disabled title="Appointment emails land in Phase 5">
          Send appointment email
        </Button>
      );
    default:
      return <span className="text-sm text-slate-400">—</span>;
  }
}

function ApproveOrReject({ board }: { board: BoardDetail }) {
  const approve = useApproveBoard(board.boardId);
  const reject = useRejectBoard(board.boardId);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // Matches the Zod rule, so the button state and the server agree.
  const reasonValid = reason.trim().length >= 10;

  return (
    <div className="space-y-2">
      {(approve.error || reject.error) && (
        <ErrorState error={approve.error ?? reject.error} />
      )}

      {!rejecting ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="success"
            loading={approve.isPending}
            onClick={() => approve.mutate({ version: board.version })}
          >
            Approve
          </Button>
          <Button variant="secondary" onClick={() => setRejecting(true)}>
            Reject
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-600">
            Reason for rejection
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Explain what the HoD needs to change…"
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
            />
          </label>
          {!reasonValid && reason.length > 0 && (
            <p className="text-xs text-slate-500">
              At least 10 characters — the HoD needs something actionable.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="danger"
              disabled={!reasonValid}
              loading={reject.isPending}
              onClick={() =>
                reject.mutate({ reason: reason.trim(), version: board.version })
              }
            >
              Confirm rejection
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setRejecting(false);
                setReason('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function OfferDates({ board }: { board: BoardDetail }) {
  const offer = useOfferDates(board.boardId);
  const [dates, setDates] = useState<string[]>(['', '', '', '']);

  const chosen = dates.filter(Boolean);
  const alreadyOffered = board.availableDates.length > 0;

  return (
    <div className="space-y-2">
      {offer.error && <ErrorState error={offer.error} />}

      {alreadyOffered && (
        <p className="text-xs text-slate-600">
          Offered:{' '}
          <span className="font-semibold">
            {board.availableDates.map((d) => d.date).join(', ')}
          </span>
          {' — awaiting the HoD’s choice.'}
        </p>
      )}

      <fieldset>
        <legend className="text-xs font-semibold text-slate-600">
          {alreadyOffered ? 'Replace offered dates' : 'Offer session dates'}
        </legend>
        <div className="mt-1 grid gap-1.5">
          {dates.map((value, i) => (
            <input
              // Fixed-length slot list, so the index is a stable identity here.
              key={i}
              type="date"
              value={value}
              aria-label={`Date ${i + 1}`}
              onChange={(e) =>
                setDates((prev) =>
                  prev.map((v, j) => (j === i ? e.target.value : v)),
                )
              }
              className="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
            />
          ))}
        </div>
      </fieldset>

      <Button
        disabled={chosen.length === 0}
        loading={offer.isPending}
        onClick={() => offer.mutate({ dates: chosen, version: board.version })}
      >
        Save &amp; notify HoD
      </Button>
    </div>
  );
}
