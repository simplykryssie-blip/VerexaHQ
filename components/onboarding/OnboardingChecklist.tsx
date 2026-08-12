"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, HelpCircle, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/Modal";

export type OnboardingStep = {
  key: string;
  label: string;
  description: string;
  href: string;
  complete: boolean;
};

type StepExplainer = {
  whatItDoes: string;
  howItWorks: string;
  howToSetUp: string;
};

const STEP_EXPLAINERS: Record<string, StepExplainer> = {
  service: {
    whatItDoes: "A service package is what you're selling -- e.g. \"Individual Tax Return\" or \"Bookkeeping.\" It's the container that ties together pricing, the forms a client fills out, and the stages their work moves through.",
    howItWorks: "Every engagement you create is built from a service package, so the package's settings (price, intake form, document requests, workflow stages) get applied automatically instead of you configuring each one by hand.",
    howToSetUp: "Go to Service Packages, clone a starter template or create your own, give it a name and price, then attach an intake form and a workflow. You can always come back and add pricing rules or billing rules later.",
  },
  organizer: {
    whatItDoes: "An intake form (organizer) is the questionnaire a client fills out before you start their work -- their info, documents needed, and anything specific to that service.",
    howItWorks: "Once a client submits it, their answers show up on their engagement automatically, and you can route different forms to different services if one form covers more than one type of work.",
    howToSetUp: "Go to Templates, create a new organizer, add the questions you need, then attach it to a service package so it gets sent automatically when that service is used.",
  },
  client: {
    whatItDoes: "This is your client record -- the person or business you do work for. Everything else (engagements, documents, invoices, messages) lives underneath a client.",
    howItWorks: "Once a client exists, you can start an engagement for them using one of your service packages, and the whole workflow (forms, documents, billing) runs from there.",
    howToSetUp: "Go to Contacts, click Add Client, and fill in their basic info. You can add a real client or a test one just to see how the workflow feels end to end.",
  },
  invite: {
    whatItDoes: "Inviting your team gives staff their own login to this workspace, with a role that controls what they can see and do.",
    howItWorks: "Each teammate gets their own account under your workspace -- not a shared login -- so you can track who did what and control access by role (e.g. preparer vs reviewer vs admin).",
    howToSetUp: "Go to Settings > Users & Staff, click Invite, enter their email and pick a role. They'll get an email to set up their own password.",
  },
  automations: {
    whatItDoes: "Automations let you decide what should happen automatically instead of a staff member remembering to do it -- e.g. when a client creates a portal account, send them a welcome email and load their intake form. Every office runs differently, so the trigger and the actions are both yours to pick.",
    howItWorks: "You choose a trigger (a client signs up, an organizer is submitted, an engagement is created, an appointment's status changes) and then one or more actions to run when it fires (send an email or text, create a task, push an intake form, start the engagement's pipeline). Nothing sends unless you build it -- there's no automation running until you create one.",
    howToSetUp: "Go to Workflows, click New workflow, pick a trigger, then add the steps you want to happen. You can pause or edit it any time, and each run shows up in that workflow's history so you can see it actually fired.",
  },
};

export function OnboardingChecklist({
  workspaceId,
  steps,
  canDismiss,
  seenSteps,
}: {
  workspaceId: string;
  steps: OnboardingStep[];
  /** Dismissing writes workspaces.onboarding_dismissed_at, which RLS only
   *  lets a workspace admin update -- hide the control for everyone else
   *  rather than let it appear to work and silently fail to persist. */
  canDismiss: boolean;
  /** Step keys this user has already seen the explainer pop-up for. */
  seenSteps: string[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [dismissing, setDismissing] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(new Set(seenSteps));
  const [popupStep, setPopupStep] = useState<OnboardingStep | null>(null);

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

  async function markSeen(stepKey: string) {
    if (seen.has(stepKey)) return;
    const next = new Set(seen);
    next.add(stepKey);
    setSeen(next);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("user_profiles")
      .update({ seen_onboarding_steps: Array.from(next) })
      .eq("id", user.id);
  }

  function handleGoClick(step: OnboardingStep, e: React.MouseEvent) {
    if (!seen.has(step.key)) {
      e.preventDefault();
      setPopupStep(step);
    }
  }

  function continueFromPopup() {
    if (!popupStep) return;
    const step = popupStep;
    setPopupStep(null);
    markSeen(step.key);
    router.push(step.href);
  }

  const explainer = popupStep ? STEP_EXPLAINERS[popupStep.key] : null;

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
                <div className="flex items-center gap-1.5">
                  <p className={`text-sm font-medium ${step.complete ? "text-muted line-through" : "text-ink"}`}>{step.label}</p>
                  {STEP_EXPLAINERS[step.key] && (
                    <button
                      type="button"
                      onClick={() => setPopupStep(step)}
                      aria-label={`What does "${step.label}" do?`}
                      className="text-muted hover:text-accent"
                    >
                      <HelpCircle size={14} />
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted">{step.description}</p>
              </div>
            </div>
            {!step.complete && (
              <Link
                href={step.href}
                onClick={(e) => handleGoClick(step, e)}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent"
              >
                Go
              </Link>
            )}
          </li>
        ))}
      </ul>

      {popupStep && explainer && (
        <Modal title={popupStep.label} onClose={() => setPopupStep(null)}>
          <div className="space-y-3 text-sm text-slate">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">What it does</p>
              <p className="mt-1">{explainer.whatItDoes}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">How it works</p>
              <p className="mt-1">{explainer.howItWorks}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">How to set it up</p>
              <p className="mt-1">{explainer.howToSetUp}</p>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setPopupStep(null)} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
              Close
            </button>
            <button
              type="button"
              onClick={continueFromPopup}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
            >
              Take me there
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
