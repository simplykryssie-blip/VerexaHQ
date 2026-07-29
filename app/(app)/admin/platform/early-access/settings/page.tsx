"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/friendlyError";
import { useToast } from "@/components/Toast";
import { logAdminActivity } from "@/lib/earlyAccess/logActivity";
import type {
  ApplicationQuestion,
  ApplicationQuestionType,
  EarlyAccessCampaign,
  EarlyAccessSettings,
  SupportProcess,
} from "@/lib/earlyAccess/types";

const TOGGLES: { key: keyof EarlyAccessSettings; label: string; help: string }[] = [
  { key: "allow_applications", label: "Allow applications", help: "Firms can submit new applications to this campaign." },
  { key: "require_agreement", label: "Require agreement", help: "Workspaces must accept the agreement before continuing onboarding." },
  { key: "allow_bug_reports", label: "Allow bug reports", help: "Shows the global Report a Bug action to participating workspaces." },
  { key: "allow_feature_requests", label: "Allow feature requests", help: "Workspaces can submit new feature requests." },
  { key: "allow_feature_voting", label: "Allow feature voting", help: "Workspaces can vote on existing feature requests." },
];

const QUESTION_TYPES: ApplicationQuestionType[] = ["text", "email", "tel", "url", "number", "textarea", "boolean", "multiselect"];

const EMPTY_SUPPORT_PROCESS: SupportProcess = {
  instructions: [],
  support_email: "",
  primary_channel: "in_app",
  critical_definition: "",
  critical_response_target: "",
  standard_response_target: "",
};

function emptyQuestion(): ApplicationQuestion {
  return { key: `question_${Math.random().toString(36).slice(2, 8)}`, type: "text", label: "", required: false };
}

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
  const [limitations, setLimitations] = useState<string[]>([]);
  const [newLimitation, setNewLimitation] = useState("");
  const [questions, setQuestions] = useState<ApplicationQuestion[]>([]);
  const [supportProcess, setSupportProcess] = useState<SupportProcess>(EMPTY_SUPPORT_PROCESS);
  const [newInstruction, setNewInstruction] = useState("");

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
    setLimitations(s?.known_limitations ?? []);
    setQuestions(s?.application_questions ?? []);
    setSupportProcess(
      s?.support_process && "instructions" in s.support_process ? (s.support_process as SupportProcess) : EMPTY_SUPPORT_PROCESS,
    );
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

  function removeLimitation(index: number) {
    setLimitations((prev) => prev.filter((_, i) => i !== index));
  }

  function updateQuestion(index: number, patch: Partial<ApplicationQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }
  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }
  function moveQuestion(index: number, dir: -1 | 1) {
    setQuestions((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeInstruction(index: number) {
    setSupportProcess((prev) => ({ ...prev, instructions: prev.instructions.filter((_, i) => i !== index) }));
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
        known_limitations: limitations,
        application_questions: questions,
        support_process: supportProcess,
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
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            onboarding_steps: steps,
            support_email: supportEmail || null,
            feedback_email: feedbackEmail || null,
            known_limitations: limitations,
            application_questions: questions,
            support_process: supportProcess,
          }
        : prev,
    );
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
        <h2 className="font-bold text-ink">Application questions</h2>
        <p className="mt-1 text-sm text-muted">
          Renders the application form at /early-access/apply. Question keys map directly onto
          early_access_applications columns.
        </p>
        <div className="mt-3 space-y-2">
          {questions.map((q, i) => (
            <div key={q.key} className="rounded-lg border border-line p-2.5">
              <div className="flex items-start gap-2">
                <div className="mt-2 text-muted">
                  <GripVertical size={13} />
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      placeholder="Key (matches applications column)"
                      value={q.key}
                      onChange={(e) => updateQuestion(i, { key: e.target.value })}
                      className="rounded-sm border border-line px-2 py-1.5 text-xs font-mono"
                    />
                    <input
                      placeholder="Label"
                      value={q.label}
                      onChange={(e) => updateQuestion(i, { label: e.target.value })}
                      className="rounded-sm border border-line px-2 py-1.5 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={q.type}
                      onChange={(e) => updateQuestion(i, { type: e.target.value as ApplicationQuestionType })}
                      className="rounded-sm border border-line px-2 py-1 text-xs capitalize"
                    >
                      {QUESTION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-muted">
                      <input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(i, { required: e.target.checked })} />
                      Required
                    </label>
                    <div className="ml-auto flex items-center gap-1">
                      <button onClick={() => moveQuestion(i, -1)} className="text-xs text-muted">
                        Up
                      </button>
                      <button onClick={() => moveQuestion(i, 1)} className="text-xs text-muted">
                        Down
                      </button>
                    </div>
                  </div>
                  {q.type === "multiselect" && (
                    <input
                      placeholder="Options, comma-separated"
                      value={(q.options ?? []).join(", ")}
                      onChange={(e) => updateQuestion(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
                      className="w-full rounded-sm border border-line px-2 py-1.5 text-xs"
                    />
                  )}
                </div>
                <button onClick={() => removeQuestion(i)} className="mt-1.5 text-muted hover:text-brick">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => setQuestions((prev) => [...prev, emptyQuestion()])}
          className="mt-2 flex items-center gap-1 text-xs font-semibold text-[#108A64]"
        >
          <Plus size={12} /> Add question
        </button>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="font-bold text-ink">Known limitations</h2>
        <p className="mt-1 text-sm text-muted">Shown during onboarding before the agreement step.</p>
        <div className="mt-3 space-y-1.5">
          {limitations.map((item, i) => (
            <div key={`${item}-${i}`} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
              <span className="flex-1 text-sm text-ink">{item}</span>
              <button onClick={() => removeLimitation(i)} className="text-muted hover:text-brick">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={newLimitation}
            onChange={(e) => setNewLimitation(e.target.value)}
            placeholder="Add a known limitation"
            className="flex-1 rounded-xl border border-line px-3 py-2 text-sm"
          />
          <button
            onClick={() => {
              if (newLimitation.trim()) {
                setLimitations((prev) => [...prev, newLimitation.trim()]);
                setNewLimitation("");
              }
            }}
            className="flex items-center gap-1 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-ink"
          >
            <Plus size={13} /> Add
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="font-bold text-ink">Support process</h2>
        <p className="mt-1 text-sm text-muted">Shown inside the Early Access Center.</p>
        <div className="mt-3 space-y-1.5">
          {supportProcess.instructions.map((line, i) => (
            <div key={`${line}-${i}`} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
              <span className="flex-1 text-sm text-ink">{line}</span>
              <button onClick={() => removeInstruction(i)} className="text-muted hover:text-brick">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={newInstruction}
            onChange={(e) => setNewInstruction(e.target.value)}
            placeholder="Add an instruction line"
            className="flex-1 rounded-xl border border-line px-3 py-2 text-sm"
          />
          <button
            onClick={() => {
              if (newInstruction.trim()) {
                setSupportProcess((prev) => ({ ...prev, instructions: [...prev.instructions, newInstruction.trim()] }));
                setNewInstruction("");
              }
            }}
            className="flex items-center gap-1 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-ink"
          >
            <Plus size={13} /> Add
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted">Support process email</label>
            <input
              type="email"
              value={supportProcess.support_email}
              onChange={(e) => setSupportProcess((prev) => ({ ...prev, support_email: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted">Primary channel</label>
            <input
              value={supportProcess.primary_channel}
              onChange={(e) => setSupportProcess((prev) => ({ ...prev, primary_channel: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-bold uppercase tracking-wide text-muted">Critical issue definition</label>
            <input
              value={supportProcess.critical_definition}
              onChange={(e) => setSupportProcess((prev) => ({ ...prev, critical_definition: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted">Critical response target</label>
            <input
              value={supportProcess.critical_response_target}
              onChange={(e) => setSupportProcess((prev) => ({ ...prev, critical_response_target: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted">Standard response target</label>
            <input
              value={supportProcess.standard_response_target}
              onChange={(e) => setSupportProcess((prev) => ({ ...prev, standard_response_target: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm"
            />
          </div>
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
