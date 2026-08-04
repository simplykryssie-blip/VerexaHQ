import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function WidgetShell({
  title,
  reportHref,
  action,
  children,
}: {
  title: string;
  reportHref?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`widget-${title}`} className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 id={`widget-${title}`} className="text-sm font-semibold text-ink">
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
      {reportHref && (
        <Link
          href={reportHref}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          View report <ArrowRight size={12} aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
