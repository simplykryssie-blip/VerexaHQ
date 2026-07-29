"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/friendlyError";
import { useToast } from "@/components/Toast";
import { logAdminActivity } from "@/lib/earlyAccess/logActivity";
import type { EarlyAccessCampaign, EarlyAccessSettings } from "@/lib/earlyAccess/types";

const TOGGLES: { key: keyof EarlyAccessSettings; label: string; help: string }[] = [
  { key: "allow_applications", label: "Allow applications", help: "Firms can submit new applications to this campaign." },
  { key: "require_agreement", label: "Require agreement", help: "Workspaces must accept the agreement before continuing onboarding." },
  { key: "allow_bug_reports", label: "Allow bug reports", help: "Shows the global Report a Bug action to participating workspaces." },
  { key: "allow_feature_requests", label: "Allow feature requests", help: "Workspaces can submit new feature requests." },
  { key: "allow_feature_voting", label: "Allow feature voting", help: "Workspaces can vote on existing feature requests." },
];

export default function EarlyAccessSettingsPage() {
  const { showSuccess, showError } = useToast();
  const [campaign, setCampaign] = useState<EarlyAccessCampaign | null>(null);
  const [settings, setSettings] = useState<EarlyAccessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [newStep, setNewStep] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: campaignRow, error: campaignError } = await supabase
      .from("early_access_campaigns")
      .select("*")
      .eq("slug", "verexahq-v0-2-founding-firm-beta")
      .maybeSingle();
    if (campaignError || !campaignRow) {
      setError(friendlyError(campaignError, "Couldn't load the Early Access campaign."));
      setLoading(false);
      return;
    }
    const c = campaignRow as EarlyAccessCampaign;
    setCampaign(c);
    const { data, error: settingsError } = await supabase
      .from("early_access_settings")
      .select("*")
      .eq("campaign_id", c.id)
      .maybeSingle();
    if (settingsError) {
      setError(friendlyError(settingsError, "Couldn't load Early Access settings."));
      setLoading(false);
      return;
    }
    const s = data as EarlyAccessSettings | null;
    setSettings(s);
    setSteps(s?.onboarding_steps ?? []);
    setSupportEmail(s?.support_email ?? "");
    setFeedbackEmail(s?.feedback_email ?? "");
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(key: keyof EarlyAccessSettings) {
    if (!settings) return;
    const nextValue = !settings[key];
    const { error: updateError } = await supabase
      .from("early_access_settings")
      .update({ [key]: nextValue })
      .eq("id", settings.id);
    if (updateError) {
      showError(friendlyError(updateError, "Couldn't update that setting."));
      return;
    }
    setSettings((prev) => (prev ? { ...prev, [key]: nextValue } : prev));
    void logAdminActivity({
      campaignId: campaign?.id ?? null,
      action: "early_access_setting_changed",
      entityType: "early_access_settings",
      entityId: settings.id,
      details: { [key]: nextValue },
    });
    showSuccess("Setting updated.");
  }

  function moveStep(index: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveDetails() {
    if (!settings) return;
    setSaving(true);
    const { error: updateError } = await supabase
      .from("early_access_settings")
      .update({
        onboarding_steps: steps,
        support_email: supportEmail || null,
        feedback_email: feedbackEmail || null,
      })
      .eq("id", settings.id);
    setSaving(false);
    if (updateError) {
      showError(friendlyError(updateError, "Couldn't save settings."));
      return;
    }
    showSuccess("Settings saved.");
    void logAdminActivity({
      campaignId: campaign?.id ?? null,
      action: "early_access_settings_updated",
      entityType: "early_access_settings",
      entityId: settings.id,
    });
    setSettings((prev) => (prev ? { ...prev, onboarding_steps: steps, support_email: supportEmail || null, feedback_email: feedbackEmail || null } : prev));
  }

  if (loading) return <p className="text-muted">Loading settings…</p>;
  if (error) return <div className="rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>;
  if (!campaign) {
    return <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">No Early Access campaign found.</div>;
  }
  if (!settings) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
        No early_access_settings row exists for this campaign yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="font-bold text-ink">Program controls</h2>
        <div className="mt-4 space-y-3">
          {TOGGLES.map((t) => (
            <div key={t.key} className="flex items-center justify-between gap-3 rounded-xl bg-paper p-3">
              <div>
                <div className="font-semibold text-ink">{t.label}</div>
                <div className="text-xs text-muted">{t.help}</div>
              </div>
              <button
                onClick={() => toggle(t.key)}
                className={`h-6 w-11 shrink-0 rounded-full transition ${settings[t.key] ? "bg-[#108A64]" : "bg-line"}`}
              >
                <span className={`block h-5 w-5 translate-x-0.5 rounded-full bg-white transition ${settings[t.key] ? "translate-x-[22px]" : ""}`} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="font-bold text-ink">Onboarding steps</h2>
        <p className="mt-1 text-sm text-muted">Order used by the workspace onboarding flow.</p>
        <div className="mt-3 space-y-1.5">
          {steps.map((step, i) => (
            <div key={`${step}-${i}`} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
              <GripVertical size={14} className="text-muted" />
              <span className="flex-1 text-sm text-ink">{step}</span>
              <button onClick={() => moveStep(i, -1)} disabled={i === 0} className="text-xs text-muted disabled:opacity-30">
                Up
              </button>
              <button onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="text-xs text-muted disabled:opacity-30">
                Down
              </button>
              <button onClick={() => removeStep(i)} className="text-muted hover:text-brick">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            placeholder="Add a step name"
            className="flex-1 rounded-xl border border-line px-3 py-2 text-sm"
          />
          <button
            onClick={() => {
              if (newStep.trim()) {
                setSteps((prev) => [...prev, newStep.trim()]);
                setNewStep("");
              }
            }}
            className="flex items-center gap-1 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-ink"
          >
            <Plus size={13} /> Add
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="font-bold text-ink">Contact emails</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted">Support email</label>
            <input
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted">Feedback email</label>
            <input
              type="email"
              value={feedbackEmail}
              onChange={(e) => setFeedbackEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      <button
        onClick={saveDetails}
        disabled={saving}
        className="rounded-xl bg-[#108A64] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}
