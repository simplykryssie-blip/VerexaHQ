import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border bg-surface px-8 py-6">
      <div>
        {backHref && (
          <Link href={backHref} className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink">
            <ArrowLeft size={14} aria-hidden="true" /> {backLabel ?? "Back"}
          </Link>
        )}
        <h1 className="font-display text-xl font-semibold text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
