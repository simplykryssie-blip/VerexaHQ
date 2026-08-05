import Link from "next/link";

export function Pager({ page, pageSize, total, basePath }: { page: number; pageSize: number; total: number; basePath: string }) {
  const pageCount = Math.max(Math.ceil(total / pageSize), 1);
  if (pageCount <= 1) return null;

  const prevDisabled = page <= 1;
  const nextDisabled = page >= pageCount;

  return (
    <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted">
      <span>
        {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Link
          href={`${basePath}?page=${Math.max(page - 1, 1)}`}
          aria-disabled={prevDisabled}
          className={`rounded-lg px-2 py-1 font-medium hover:bg-surfaceMuted hover:text-ink ${prevDisabled ? "pointer-events-none opacity-40" : ""}`}
        >
          Previous
        </Link>
        <span>
          Page {page} of {pageCount}
        </span>
        <Link
          href={`${basePath}?page=${Math.min(page + 1, pageCount)}`}
          aria-disabled={nextDisabled}
          className={`rounded-lg px-2 py-1 font-medium hover:bg-surfaceMuted hover:text-ink ${nextDisabled ? "pointer-events-none opacity-40" : ""}`}
        >
          Next
        </Link>
      </div>
    </div>
  );
}
