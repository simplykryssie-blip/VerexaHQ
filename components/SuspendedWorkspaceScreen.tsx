import Link from "next/link";
import { AlertTriangle } from "lucide-react";

const SUSPENSION_REASON_LABEL: Record<string, string> = {
  billing_past_due: "Your Verexa subscription payment is past due.",
  subscription_canceled: "Your Verexa subscription was canceled.",
  billing_incomplete: "You haven't completed your Verexa subscription signup yet.",
};

// Replaces the normal app shell for a suspended workspace on every route
// except the billing-recovery surface (see isSuspensionRecoveryPath) --
// mirrors AcceptTermsGate's precedent of blocking the whole shell rather
// than layering a dismissible banner over pages that shouldn't be reachable
// at all. Deliberately has no nav -- the only way out is the link below, so
// there's no leftover sidebar link into operational data to click through.
export function SuspendedWorkspaceScreen({ suspensionReason }: { suspensionReason: string | null }) {
  const reasonText = (suspensionReason && SUSPENSION_REASON_LABEL[suspensionReason]) ?? "Your Verexa workspace is currently suspended.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-surfaceMuted px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-soft">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle size={22} aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-lg font-semibold text-ink">Workspace suspended</h1>
        <p className="mt-2 text-sm text-muted">{reasonText}</p>
        <p className="mt-2 text-sm text-muted">Normal workspace access is unavailable until billing is resolved.</p>
        <Link
          href="/settings/plan-usage"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
        >
          Resolve Billing
        </Link>
      </div>
    </div>
  );
}
