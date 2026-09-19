import Link from "next/link";
import { AlertTriangle } from "lucide-react";

const SUSPENSION_REASON_LABEL: Record<string, string> = {
  billing_past_due: "Your Verexa subscription payment is past due.",
  subscription_canceled: "Your Verexa subscription was canceled.",
  billing_incomplete: "You haven't completed your Verexa subscription signup yet.",
};

// Replaces the normal app shell for a non-operational workspace (suspended,
// archived, or permanently archived) on every route except the
// billing-recovery surface (see isSuspensionRecoveryPath) -- mirrors
// AcceptTermsGate's precedent of blocking the whole shell rather than
// layering a dismissible banner over pages that shouldn't be reachable at
// all. Deliberately has no nav -- the only way out is the link below, so
// there's no leftover sidebar link into operational data to click through.
export function SuspendedWorkspaceScreen({
  status,
  suspensionReason,
}: {
  status: string;
  suspensionReason: string | null;
}) {
  const isArchived = status === "archived" || status === "permanently_archived";
  const reasonText = isArchived
    ? "This workspace has been archived after an extended billing suspension."
    : (suspensionReason && SUSPENSION_REASON_LABEL[suspensionReason]) ?? "Your Verexa workspace is currently suspended.";
  const heading = isArchived ? "Workspace archived" : "Workspace suspended";
  // Archived/permanently-archived recovery is a separate, not-yet-built
  // product flow -- this only ever points people at Support rather than
  // implying billing can self-serve reactivate an already-archived
  // workspace.
  const ctaHref = isArchived ? "/support" : "/settings/plan-usage";
  const ctaLabel = isArchived ? "Contact Support" : "Resolve Billing";

  return (
    <div className="flex min-h-screen items-center justify-center bg-surfaceMuted px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-soft">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle size={22} aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-lg font-semibold text-ink">{heading}</h1>
        <p className="mt-2 text-sm text-muted">{reasonText}</p>
        <p className="mt-2 text-sm text-muted">
          {isArchived
            ? "Normal workspace access is unavailable. Contact Support for assistance."
            : "Normal workspace access is unavailable until billing is resolved."}
        </p>
        <Link
          href={ctaHref}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
