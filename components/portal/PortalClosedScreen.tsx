import { AlertTriangle } from "lucide-react";

const STATUS_COPY: Record<string, string> = {
  archived: "This firm's workspace has been archived and the client portal is no longer available. Your data is retained per the firm's Privacy Policy -- contact the firm directly for assistance.",
  permanently_archived: "This firm's workspace has been permanently archived and the client portal is no longer available. Contact the firm directly for assistance.",
};

// Closes the client portal for a client whose firm's workspace has reached
// archived/permanently_archived -- the locked lifecycle policy's Day-30
// "Client portal is closed" requirement. Deliberately NOT shown for
// suspended: existing clients may keep using the portal during that period
// per current policy (RLS already blocks new organizer/message *writes* at
// every non-active stage -- this screen closes read/view access too, but
// only once archived). Mirrors SuspendedWorkspaceScreen's shape (full-shell
// replacement, no nav) for the staff-side equivalent.
export function PortalClosedScreen({ status }: { status: string }) {
  const body = STATUS_COPY[status] ?? STATUS_COPY.archived;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surfaceMuted px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-soft">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle size={22} aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-lg font-semibold text-ink">Portal unavailable</h1>
        <p className="mt-2 text-sm text-muted">{body}</p>
        <form action="/api/auth/sign-out" method="post" className="mt-6">
          <input type="hidden" name="audience" value="portal" />
          <button type="submit" className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
