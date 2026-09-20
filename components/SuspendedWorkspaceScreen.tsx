import Link from "next/link";
import { AlertTriangle } from "lucide-react";

const SUSPENSION_REASON_LABEL: Record<string, string> = {
  billing_past_due: "Your Verexa subscription payment is past due.",
  subscription_canceled: "Your Verexa subscription was canceled.",
  billing_incomplete: "You haven't completed your Verexa subscription signup yet.",
};

const STATUS_COPY: Record<string, { heading: string; body: string; ctaLabel: string }> = {
  suspended: {
    heading: "Workspace suspended",
    body: "Normal workspace access is unavailable until billing is resolved.",
    ctaLabel: "Resolve Billing",
  },
  archived: {
    heading: "Workspace archived",
    body: "This workspace was archived after an extended billing suspension. Your data is retained per our Privacy Policy -- visit Plan & Usage to resolve billing, or contact Support for export/recovery options.",
    ctaLabel: "Go to Plan & Usage",
  },
  permanently_archived: {
    heading: "Workspace permanently archived",
    body: "This workspace's subscription and account relationship have been terminated. Your data remains retained per our Privacy Policy -- contact Support for data export options.",
    ctaLabel: "Contact Support",
  },
};

// Replaces the normal app shell for a non-operational workspace (suspended,
// archived, or permanently_archived) on every route except the
// billing-recovery surface (see isSuspensionRecoveryPath) -- mirrors
// AcceptTermsGate's precedent of blocking the whole shell rather than
// layering a dismissible banner over pages that shouldn't be reachable at
// all. Deliberately has no nav -- the only way out is the link below, so
// there's no leftover sidebar link into operational data to click through.
export function SuspendedWorkspaceScreen({ status, suspensionReason }: { status: string; suspensionReason: string | null }) {
  const copy = STATUS_COPY[status] ?? STATUS_COPY.suspended;
  const reasonText = status === "suspended" ? ((suspensionReason && SUSPENSION_REASON_LABEL[suspensionReason]) ?? "Your Verexa workspace is currently suspended.") : null;
  const ctaHref = status === "permanently_archived" ? "/support" : "/settings/plan-usage";

  return (
    <div className="flex min-h-screen items-center justify-center bg-surfaceMuted px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-soft">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle size={22} aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-lg font-semibold text-ink">{copy.heading}</h1>
        {reasonText && <p className="mt-2 text-sm text-muted">{reasonText}</p>}
        <p className="mt-2 text-sm text-muted">{copy.body}</p>
        <Link href={ctaHref} className="mt-6 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90">
          {copy.ctaLabel}
        </Link>
      </div>
    </div>
  );
}
