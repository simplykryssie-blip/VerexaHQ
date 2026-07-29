"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useEarlyAccessMembership } from "@/lib/earlyAccess/useEarlyAccessMembership";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { friendlyError } from "@/lib/friendlyError";
import { useToast } from "@/components/Toast";
import type { EarlyAccessSettings } from "@/lib/earlyAccess/types";

function storageKey(workspaceId: string) {
  return `verexahq_ea_onboarding_${workspaceId}`;
}

// Known steps get a real action; anything else in the configured list still
// renders with a generic "mark complete and continue" fallback so unknown
// future step names don't break the flow.
const STEP_LINKS: Record<string, { label: string; href: string }> = {
  "Workspace Setup": { label: "Go to workspace settings", href: "/settings" },
  "Brand Upload": { label: "Go to Brand Center", href: "/settings" },
  "Choose Services": { label: "Go to Services", href: "/services" },
  "Import Clients": { label: "Go to Clients", href: "/clients" },
};

export default function EarlyAccessOnboardingPage() {
  const { activeWorkspaceId } = useWorkspace();
  const { loading: membershipLoading, inProgram, campaign } = useEarlyAccessMembership(activeWorkspaceId);
  const { showSuccess, showError } = useToast();
  const [settings, setSettings] = useState<EarlyAccessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState(0);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [submittingAgreement, setSubmittingAgreement] = useState(false);
  const [agreementAlreadyAccepted, setAgreementAlreadyAccepted] = useState(false);

  const load = useCallback(async () => {
    if (!campaign || !activeWorkspaceId) return;
    setLoading(true);
    setError(null);

    const { data: settingsRow, error: settingsError } = await supabase
      .from("early_access_settings")
      .select("*")
      .eq("campaign_id", campaign.id)
      .maybeSingle();
    if (settingsError) {
      setError(friendlyError(settingsError, "Couldn't load onboarding steps."));
      setLoading(false);
      return;
    }
    setSettings(settingsRow as EarlyAccessSettings | null);

    const { data: agreement } = await supabase
      .from("early_access_agreements")
      .select("id")
      .eq("campaign_id", campaign.id)
      .eq("workspace_id", activeWorkspaceId)
      .maybeSingle();
    setAgreementAlreadyAccepted(!!agreement);

    const saved = typeof window !== "undefined" ? localStorage.getItem(storageKey(activeWorkspaceId)) : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { completed: string[]; current: number };
        setCompleted(new Set(parsed.completed));
        setCurrent(parsed.current);
      } catch {
        /* ignore malformed local state */
      }
    }
    setLoading(false);
  }, [campaign, activeWorkspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  function persist(nextCompleted: Set<string>, nextCurrent: number) {
    if (!activeWorkspaceId) return;
    localStorage.setItem(
      storageKey(activeWorkspaceId),
      JSON.stringify({ completed: Array.from(nextCompleted), current: nextCurrent }),
    );
  }

  function completeAndAdvance(stepName: string) {
    const next = new Set(completed).add(stepName);
    const nextIndex = Math.min(current + 1, (settings?.onboarding_steps.length ?? 1) - 1);
    setCompleted(next);
    setCurrent(nextIndex);
    persist(next, nextIndex);
  }

  function goTo(index: number) {
    setCurrent(index);
    persist(completed, index);
  }

  async function acceptAgreement() {
    if (!campaign || !activeWorkspaceId || !agreementChecked) return;
    setSubmittingAgreement(true);
    const res = await authenticatedFetch("/api/early-access/agreements/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: campaign.id,
        workspaceId: activeWorkspaceId,
        agreementVersion: campaign.agreement_version ?? "v1",
        agreementSnapshot: campaign.agreement_content ?? "",
      }),
    });
    const result = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
    setSubmittingAgreement(false);
    if (!result || !result.ok) {
      showError(result?.error ?? "Couldn't record your acceptance.");
      return;
    }
    showSuccess("Agreement accepted.");
    setAgreementAlreadyAccepted(true);
    completeAndAdvance("Agreement");
  }

  if (membershipLoading || loading) return <p className="text-muted">Loading onboarding…</p>;
  if (!inProgram || !campaign) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
        Onboarding is available once your workspace has joined an Early Access program.
      </div>
    );
  }
  if (error) return <div className="rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>;

  const steps = settings?.onboarding_steps ?? [];
  if (steps.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
        No onboarding steps are configured for this campaign yet.
      </div>
    );
  }

  const stepName = steps[current];
  const isDone = completed.has(stepName) || (stepName === "Agreement" && agreementAlreadyAccepted);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-ink">Getting started with {campaign.name}</h1>

      <div className="mt-5 flex flex-wrap gap-2">
        {steps.map((s, i) => {
          const done = completed.has(s) || (s === "Agreement" && agreementAlreadyAccepted);
          return (
            <button
              key={`${s}-${i}`}
              onClick={() => goTo(i)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                i === current ? "border-[#108A64] bg-emerald-50 text-[#108A64]" : done ? "border-line bg-paper text-ink" : "border-line text-muted"
              }`}
            >
              {done ? <CheckCircle2 size={13} /> : <Circle size={13} />}
              {s}
            </button>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-white p-6">
        {stepName === "Welcome" && (
          <div>
            <h2 className="text-lg font-bold text-ink">Welcome to {campaign.name}</h2>
            <p className="mt-2 text-sm text-muted">
              You&apos;re one of the founding firms shaping VerexaHQ {campaign.version_label}. This short
              walkthrough gets your workspace ready.
            </p>
            <button onClick={() => completeAndAdvance(stepName)} className="mt-4 flex items-center gap-1.5 rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white">
              Continue <ArrowRight size={14} />
            </button>
          </div>
        )}

        {stepName === "Beta Expectations" && (
          <div>
            <h2 className="text-lg font-bold text-ink">What to expect during the beta</h2>
            <p className="mt-2 text-sm text-muted">
              This is early software. You may find rough edges — use the Report a Bug action any time you
              hit one, and share ideas through Feature Requests. The team reviews both regularly.
            </p>
            <button onClick={() => completeAndAdvance(stepName)} className="mt-4 flex items-center gap-1.5 rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white">
              Continue <ArrowRight size={14} />
            </button>
          </div>
        )}

        {stepName === "Agreement" && (
          <div>
            <h2 className="text-lg font-bold text-ink">Founding firm agreement</h2>
            {agreementAlreadyAccepted ? (
              <div className="mt-3 flex items-center gap-2 text-sm text-green">
                <CheckCircle2 size={16} /> Already accepted for this workspace.
              </div>
            ) : (
              <>
                <div className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-paper p-3 text-xs text-ink">
                  {campaign.agreement_content || "No agreement content has been configured yet."}
                </div>
                <label className="mt-3 flex items-start gap-2 text-sm text-ink">
                  <input type="checkbox" checked={agreementChecked} onChange={(e) => setAgreementChecked(e.target.checked)} className="mt-0.5" />
                  I have read and accept this agreement ({campaign.agreement_version ?? "current version"}).
                </label>
                <button
                  onClick={acceptAgreement}
                  disabled={!agreementChecked || submittingAgreement}
                  className="mt-4 flex items-center gap-1.5 rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {submittingAgreement ? "Recording…" : "Accept and continue"} <ArrowRight size={14} />
                </button>
              </>
            )}
            {agreementAlreadyAccepted && (
              <button onClick={() => completeAndAdvance(stepName)} className="mt-4 flex items-center gap-1.5 rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white">
                Continue <ArrowRight size={14} />
              </button>
            )}
          </div>
        )}

        {stepName === "Invite Team" && (
          <div>
            <h2 className="text-lg font-bold text-ink">Invite your team</h2>
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Team invitations aren&apos;t built yet — coming soon. You can skip this step for now.
            </div>
            <button onClick={() => completeAndAdvance(stepName)} className="mt-4 flex items-center gap-1.5 rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white">
              Skip for now <ArrowRight size={14} />
            </button>
          </div>
        )}

        {stepName === "Finished" && (
          <div>
            <h2 className="text-lg font-bold text-ink">You&apos;re all set</h2>
            <p className="mt-2 text-sm text-muted">
              Your workspace is ready. Head to your Early Access Center any time for announcements, bug
              reports, feature requests, and surveys.
            </p>
            <Link href="/early-access" onClick={() => completeAndAdvance(stepName)} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white">
              Go to Early Access Center <ArrowRight size={14} />
            </Link>
          </div>
        )}

        {STEP_LINKS[stepName] && (
          <div>
            <h2 className="text-lg font-bold text-ink">{stepName}</h2>
            <p className="mt-2 text-sm text-muted">This step lives in its usual place in VerexaHQ — nothing new to learn.</p>
            <div className="mt-4 flex gap-2">
              <Link href={STEP_LINKS[stepName].href} className="flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink">
                {STEP_LINKS[stepName].label} <ArrowRight size={14} />
              </Link>
              <button onClick={() => completeAndAdvance(stepName)} className="rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white">
                Mark done & continue
              </button>
            </div>
          </div>
        )}

        {!["Welcome", "Beta Expectations", "Agreement", "Invite Team", "Finished"].includes(stepName) &&
          !STEP_LINKS[stepName] && (
            <div>
              <h2 className="text-lg font-bold text-ink">{stepName}</h2>
              <p className="mt-2 text-sm text-muted">
                {isDone ? "Completed." : "Mark this step complete once you're ready to continue."}
              </p>
              <button onClick={() => completeAndAdvance(stepName)} className="mt-4 flex items-center gap-1.5 rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white">
                Continue <ArrowRight size={14} />
              </button>
            </div>
          )}
      </div>
    </div>
  );
}
