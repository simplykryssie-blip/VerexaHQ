export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-surfaceMuted ${className}`} />;
}

export function DashboardSkeleton() {
  return (
    <div className="flex-1 px-8 py-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-7 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Generic loading shape for any list page (table or card grid) -- a filter-bar-height bar plus N row placeholders. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex-1 px-8 py-6">
      <Skeleton className="mb-4 h-9 w-full max-w-xs" />
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-b-0">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="ml-auto h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReportSkeleton() {
  return (
    <div className="flex-1 space-y-4 px-8 py-6">
      <Skeleton className="h-16 w-full" />
      <div className="rounded-xl border border-border bg-surface p-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="mb-2 h-8 w-full" />
        ))}
      </div>
    </div>
  );
}
