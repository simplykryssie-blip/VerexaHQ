"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type OnboardingStep = {
  key: string;
  label: string;
  description: string;
  href: string;
  complete: boolean;
};

export function OnboardingChecklist({
  workspaceId,
  steps,
  canDismiss,
}: {
  workspaceId: string;
  steps: OnboardingStep[];
  /** Dismissing writes workspaces.onboarding_dismissed_at, which RLS only
   *  lets a workspace admin update -- hide the control for everyone else
   *  rather than let it appear to work and silently fail to persist. */
  canDismiss: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [dismissing, setDismissing] = useState(false);
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  const doneCount = steps.filter((s) => s.complete).length;
  const allDone = doneCount === steps.length;

  async function dismiss() {
    setDismissing(true);
    setHidden(true);
    const { error } = await supabase.from("workspaces").update({ onboarding_dismissed_at: new Date().toISOString() }).eq("id", workspaceId);
    setDismissing(false);
    if (!error) router.refresh();
  }

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">{allDone ? "You're all set up" : "Get your firm set up"}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {allDone
              ? "You've completed every setup step. This card won't show again once dismissed."
              : `${doneCount} of ${steps.length} steps complete`}
          </p>
        </div>
        {canDismiss && (
          <button
            type="button"
            onClick={dismiss}
            disabled={dismissing}
            aria-label="Dismiss setup checklist"
            className="rounded p-1 text-muted hover:text-ink disabled:opacity-50"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {!allDone && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surfaceMuted">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
      )}

      <ul className="mt-4 divide-y divide-border">
        {steps.map((step) => (
          <li key={step.key} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex items-start gap-2.5">
              {step.complete ? (
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <Circle size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
              )}
              <div>
                <p className={`text-sm font-medium ${step.complete ? "text-muted line-through" : "text-ink"}`}>{step.label}</p>
                <p className="text-xs text-muted">{step.description}</p>
              </div>
            </div>
            {!step.complete && (
              <Link
                href={step.href}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent"
              >
                Go
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
