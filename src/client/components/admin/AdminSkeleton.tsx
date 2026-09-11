/**
 * The admin portal's shape, before its data arrives.
 *
 * Replaces a centred spinner and the line "Loading portal data…", which told
 * the user nothing and then let the whole page slam into place beneath it.
 * Blocking out the real layout at the real sizes holds the page still, so
 * nothing jumps when the request lands — and that matters more, not less,
 * once this is talking to Sheets rather than fixtures.
 *
 * `motion-safe:` on the pulse: under reduced motion these are flat grey
 * blocks, which still communicate "not yet" without the throb.
 */
function Block({ className = '' }: { className?: string }) {
  return (
    <span
      className={`block rounded bg-slate-200 motion-safe:animate-pulse ${className}`}
    />
  );
}

export function AdminSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      {/* Stat strip */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="rounded-xl bg-amber-50/60 px-4 py-4 ring-1 ring-inset ring-amber-100 sm:w-64">
          <Block className="h-4 w-32" />
          <Block className="mt-4 h-9 w-16" />
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-inset ring-slate-100"
            >
              <Block className="h-3 w-20" />
              <Block className="mt-2.5 h-6 w-8" />
            </div>
          ))}
        </div>
      </div>

      {/* Queue */}
      <div className="mt-6 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <Block className="h-3.5 w-24" />
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 2 }, (_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
            >
              <Block className="h-4 w-40" />
              <Block className="h-3 w-28" />
              <Block className="h-6 w-24 rounded-full" />
              <Block className="h-9 w-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Table — rows at the real height, so nothing shifts when data lands. */}
      <div className="mt-7 flex items-center justify-between">
        <Block className="h-3.5 w-20" />
        <Block className="h-8 w-64" />
      </div>

      <div className="mt-3 overflow-hidden rounded-lg ring-1 ring-slate-200">
        <div className="flex gap-4 bg-slate-50 px-3 py-2.5">
          <Block className="h-3 w-40" />
          <Block className="h-3 w-16" />
          <Block className="h-3 w-24" />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-t border-slate-100 px-3 py-3"
          >
            <div className="flex-1">
              <Block className="h-4 w-48" />
              <Block className="mt-1.5 h-3 w-24" />
            </div>
            <Block className="h-1.5 w-28 rounded-full" />
            <Block className="h-6 w-20 rounded-full" />
            <Block className="h-7 w-16" />
          </div>
        ))}
      </div>

      <span className="sr-only" role="status">
        Loading portal data…
      </span>
    </div>
  );
}
