"use client";

import { useEffect, useState } from "react";
import { CreditCard, AlertCircle } from "lucide-react";

type SetupResponse = { step: "complete" | "processing" | "awaiting_payment_method"; checkoutUrl?: string } | { error: string };

// Replaces the whole app shell for the one named legacy workspace that
// still has no real Stripe Subscription (see
// lib/billing/legacyMigrationWorkspaces.ts) -- same "block the shell, don't
// layer a dismissible banner" precedent as SuspendedWorkspaceScreen, but
// deliberately offers no link anywhere else in the app: the only thing this
// screen ever does is redirect straight to Stripe's own hosted card-
// collection page, which is what actually enforces "no fake card info" (a
// real card network validation Verexa's own code can't replicate). There is
// nothing to skip past on this screen because there is nothing to click.
export function RequiredCardSetupScreen() {
  const [state, setState] = useState<"loading" | "redirecting" | "processing" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    async function run() {
      try {
        const res = await fetch("/api/billing/legacy-payment-setup", { method: "POST" });
        const data: SetupResponse = await res.json();
        if (cancelled) return;

        if (!res.ok || "error" in data) {
          setErrorMessage("error" in data ? data.error : "Something went wrong setting up billing.");
          setState("error");
          return;
        }

        if (data.step === "awaiting_payment_method" && data.checkoutUrl) {
          setState("redirecting");
          window.location.href = data.checkoutUrl;
          return;
        }

        if (data.step === "processing") {
          setState("processing");
          retryTimer = setTimeout(run, 3000);
          return;
        }

        // step === "complete" -- the Subscription now exists; reload picks
        // up the normal app shell on the server's next render.
        window.location.reload();
      } catch {
        if (!cancelled) {
          setErrorMessage("Could not reach the server. Check your connection and try again.");
          setState("error");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surfaceMuted px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-soft">
        <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${state === "error" ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent"}`}>
          {state === "error" ? <AlertCircle size={22} aria-hidden="true" /> : <CreditCard size={22} aria-hidden="true" />}
        </span>
        <h1 className="mt-4 font-display text-lg font-semibold text-ink">Add a payment method to continue</h1>
        {state === "error" ? (
          <>
            <p className="mt-2 text-sm text-muted">{errorMessage}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              Try again
            </button>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {state === "processing" ? "Finishing setup, one moment..." : "Redirecting you to a secure page to add your card..."}
          </p>
        )}
      </div>
    </div>
  );
}
