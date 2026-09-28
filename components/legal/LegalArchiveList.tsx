import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/EmptyState";
import { RetryLegalArchiveButton } from "@/components/legal/RetryLegalArchiveButton";

export type LegalArchiveRow = {
  id: string;
  version: string;
  status: "pending" | "generated" | "failed";
  accepted_at: string;
  accepted_by_name: string | null;
  accepted_by_email: string | null;
  viewUrl: string | null;
};

const STATUS_TONE: Record<LegalArchiveRow["status"], "success" | "warning" | "danger"> = {
  generated: "success",
  pending: "warning",
  failed: "danger",
};

const STATUS_LABEL: Record<LegalArchiveRow["status"], string> = {
  generated: "Available",
  pending: "Preparing...",
  failed: "Couldn't be generated",
};

// Shared by the platform admin workspace detail page and the workspace
// owner's own Plan & Usage page -- the retry action only renders when the
// caller explicitly opts in (admin context), since retrying is an
// admin-only capability.
export function LegalArchiveList({ rows, showRetry = false }: { rows: LegalArchiveRow[]; showRetry?: boolean }) {
  if (rows.length === 0) {
    return <EmptyState message="No legal acceptance archive yet -- one is created the next time Terms/Privacy are accepted." />;
  }

  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
          <div>
            <p className="font-medium text-ink">Verexa Platform Policies -- version {row.version}</p>
            <p className="mt-0.5 text-xs text-muted">
              Accepted {new Date(row.accepted_at).toLocaleString()}
              {row.accepted_by_name ? ` by ${row.accepted_by_name}` : ""}
              {row.accepted_by_email ? ` (${row.accepted_by_email})` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
            {row.status === "generated" && row.viewUrl && (
              <a href={row.viewUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-accent hover:underline">
                View PDF
              </a>
            )}
            {row.status === "failed" && showRetry && <RetryLegalArchiveButton archiveId={row.id} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
