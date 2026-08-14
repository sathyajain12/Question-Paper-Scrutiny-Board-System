import type { DashboardCounts } from '@shared/types';

const CARDS: {
  key: keyof DashboardCounts;
  label: string;
  className: string;
}[] = [
  { key: 'total', label: 'Total boards', className: 'bg-brand-50 text-brand-700' },
  { key: 'notSubmitted', label: 'Not submitted', className: 'bg-slate-100 text-slate-700' },
  { key: 'submitted', label: 'Pending approval', className: 'bg-amber-50 text-amber-800' },
  { key: 'approved', label: 'Approved', className: 'bg-emerald-50 text-emerald-800' },
  { key: 'rejected', label: 'Rejected', className: 'bg-red-50 text-red-800' },
  { key: 'locked', label: 'Scheduled', className: 'bg-blue-50 text-blue-800' },
];

export function SummaryCards({ counts }: { counts: DashboardCounts }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {CARDS.map(({ key, label, className }) => (
        <div key={key} className={`rounded-lg px-4 py-3 text-center ${className}`}>
          <dd className="text-2xl font-bold">{counts[key]}</dd>
          <dt className="mt-0.5 text-xs">{label}</dt>
        </div>
      ))}
    </dl>
  );
}
