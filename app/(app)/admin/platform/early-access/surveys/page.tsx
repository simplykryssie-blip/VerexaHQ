"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, X, GripVertical } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/friendlyError";
import { useToast } from "@/components/Toast";
import { logAdminActivity } from "@/lib/earlyAccess/logActivity";
import type { EarlyAccessCampaign, EarlyAccessSurvey, SurveyQuestion, SurveyStatus } from "@/lib/earlyAccess/types";

const STATUSES: SurveyStatus[] = ["draft", "active", "paused", "closed"];
const QUESTION_TYPES: SurveyQuestion["type"][] = ["satisfaction", "nps", "text", "choice"];

function StatusBadge({ status }: { status: SurveyStatus }) {
  const style: Record<SurveyStatus, string> = {
    draft: "bg-paper text-muted",
    active: "bg-emerald-50 text-emerald-700",
    paused: "bg-amber-50 text-amber-700",
    closed: "bg-paper text-muted",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${style[status]}`}>{status}</span>;
}

function emptyQuestion(): SurveyQuestion {
  return { key: `q_${Math.random().toString(36).slice(2, 8)}`, label: "", type: "text", required: false };
}

export default function AdminSurveysPage() {
  const { showSuccess, showError } = useToast();
  const [campaign, setCampaign] = useState<EarlyAccessCampaign | null>(null);
  const [surveys, setSurveys] = useState<EarlyAccessSurvey[]>([]);
  const [responseCounts, setResponseCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<EarlyAccessSurvey | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerDay, setTriggerDay] = useState<string>("7");
  const [customDay, setCustomDay] = useState("");
  const [questions, setQuestions] = useState<SurveyQuestion[]>([emptyQuestion()]);
  const [saving, setSaving] = useState(false);

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
    const { data, error: surveysError } = await supabase
      .from("early_access_surveys")
      .select("*")
      .eq("campaign_id", c.id)
      .order("created_at", { ascending: false });
    if (surveysError) {
      setError(friendlyError(surveysError, "Couldn't load surveys."));
      setLoading(false);
      return;
    }
    const list = (data as EarlyAccessSurvey[]) ?? [];
    setSurveys(list);
    if (list.length > 0) {
      const { data: responses } = await supabase
        .from("early_access_survey_responses")
        .select("survey_id")
        .in("survey_id", list.map((s) => s.id));
      const counts: Record<string, number> = {};
      for (const r of (responses as { survey_id: string }[] | null) ?? []) {
        counts[r.survey_id] = (counts[r.survey_id] ?? 0) + 1;
      }
      setResponseCounts(counts);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setEditing(null);
    setName("");
    setDescription("");
    setTriggerDay("7");
    setCustomDay("");
    setQuestions([emptyQuestion()]);
    setShowEditor(true);
  }

  function openEdit(s: EarlyAccessSurvey) {
    setEditing(s);
    setShowEditor(true);
    setName(s.name);
    setDescription(s.description ?? "");
    if (s.trigger_day === 7 || s.trigger_day === 14 || s.trigger_day === 30) {
      setTriggerDay(String(s.trigger_day));
    } else {
      setTriggerDay("custom");
      setCustomDay(s.trigger_day?.toString() ?? "");
    }
    setQuestions(s.questions.length > 0 ? s.questions : [emptyQuestion()]);
  }

  function updateQuestion(index: number, patch: Partial<SurveyQuestion>) {
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

  async function saveSurvey(nextStatus?: SurveyStatus) {
    if (!campaign) return;
    if (!name.trim()) {
      showError("Survey name is required.");
      return;
    }
    if (questions.some((q) => !q.label.trim())) {
      showError("Every question needs a label.");
      return;
    }
    setSaving(true);
    const day = triggerDay === "custom" ? Number(customDay) || null : Number(triggerDay);
    const { data: sessionData } = await supabase.auth.getSession();
    const payload = {
      campaign_id: campaign.id,
      name: name.trim(),
      description: description || null,
      trigger_day: day,
      questions,
      ...(nextStatus ? { status: nextStatus } : {}),
    };

    let error;
    let id = editing?.id;
    if (editing) {
      ({ error } = await supabase.from("early_access_surveys").update(payload).eq("id", editing.id));
    } else {
      const { data, error: insertError } = await supabase
        .from("early_access_surveys")
        .insert({ ...payload, created_by: sessionData.session?.user.id ?? null })
        .select("id")
        .single();
      error = insertError;
      id = data?.id;
    }
    setSaving(false);
    if (error) {
      showError(friendlyError(error, "Couldn't save the survey."));
      return;
    }
    showSuccess(editing ? "Survey updated." : "Survey created.");
    void logAdminActivity({
      campaignId: campaign.id,
      action: editing ? "survey_updated" : "survey_created",
      entityType: "early_access_survey",
      entityId: id ?? null,
    });
    setShowEditor(false);
    void load();
  }

  async function setStatus(s: EarlyAccessSurvey, status: SurveyStatus) {
    const { error: updateError } = await supabase.from("early_access_surveys").update({ status }).eq("id", s.id);
    if (updateError) {
      showError(friendlyError(updateError, "Couldn't change survey status."));
      return;
    }
    showSuccess(`Survey marked ${status}.`);
    void logAdminActivity({
      campaignId: campaign?.id ?? null,
      action: "survey_status_changed",
      entityType: "early_access_survey",
      entityId: s.id,
      details: { to: status },
    });
    setSurveys((prev) => prev.map((x) => (x.id === s.id ? { ...x, status } : x)));
  }

  if (loading) return <p className="text-muted">Loading surveys…</p>;
  if (error) return <div className="rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>;
  if (!campaign) {
    return <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">No Early Access campaign found.</div>;
  }

  return (
    <div>
      <div className="flex justify-end">
        <button onClick={openNew} className="flex items-center gap-1.5 rounded-xl bg-[#108A64] px-3.5 py-2 text-sm font-semibold text-white">
          <Plus size={15} /> New survey
        </button>
      </div>

      {surveys.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">No surveys yet.</div>
      ) : (
        <div className="mt-5 space-y-3">
          {surveys.map((s) => (
            <div key={s.id} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{s.name}</span>
                    <StatusBadge status={s.status} />
                    {s.trigger_day !== null && <span className="text-xs text-muted">Day {s.trigger_day}</span>}
                  </div>
                  {s.description && <p className="mt-1 text-sm text-muted">{s.description}</p>}
                  <div className="mt-1 text-xs text-muted">
                    {s.questions.length} question{s.questions.length === 1 ? "" : "s"} · {responseCounts[s.id] ?? 0} response
                    {(responseCounts[s.id] ?? 0) === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => openEdit(s)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink">
                    Edit
                  </button>
                  {s.status === "draft" && (
                    <button onClick={() => setStatus(s, "active")} className="rounded-lg bg-[#108A64] px-3 py-1.5 text-xs font-semibold text-white">
                      Activate
                    </button>
                  )}
                  {s.status === "active" && (
                    <button onClick={() => setStatus(s, "paused")} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink">
                      Pause
                    </button>
                  )}
                  {s.status !== "closed" && (
                    <button onClick={() => setStatus(s, "closed")} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brick">
                      Close
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showEditor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-sm border border-line bg-white p-6">
            <div className="mb-4 flex items-start justify-between">
              <h3 className="font-slab text-lg font-bold text-ink">{editing ? "Edit survey" : "New survey"}</h3>
              <button onClick={() => setShowEditor(false)} className="text-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                placeholder="Survey name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              />
              <textarea
                placeholder="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              />
              <div>
                <label className="text-xs text-muted">Trigger</label>
                <div className="mt-1 flex gap-2">
                  {["7", "14", "30", "custom"].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setTriggerDay(d)}
                      className={`flex-1 rounded-sm border px-2 py-2 text-xs font-semibold ${triggerDay === d ? "border-[#108A64] bg-emerald-50 text-[#108A64]" : "border-line text-ink"}`}
                    >
                      {d === "custom" ? "Custom" : `Day ${d}`}
                    </button>
                  ))}
                </div>
                {triggerDay === "custom" && (
                  <input
                    type="number"
                    min={0}
                    placeholder="Day number"
                    value={customDay}
                    onChange={(e) => setCustomDay(e.target.value)}
                    className="mt-2 w-full rounded-sm border border-line px-3 py-2 text-sm"
                  />
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wide text-muted">Questions</label>
                  <button
                    type="button"
                    onClick={() => setQuestions((prev) => [...prev, emptyQuestion()])}
                    className="flex items-center gap-1 text-xs font-semibold text-[#108A64]"
                  >
                    <Plus size={12} /> Add question
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {questions.map((q, i) => (
                    <div key={q.key} className="rounded-lg border border-line p-2.5">
                      <div className="flex items-start gap-2">
                        <div className="mt-2 flex flex-col text-muted">
                          <button type="button" onClick={() => moveQuestion(i, -1)} className="hover:text-ink">
                            <GripVertical size={13} />
                          </button>
                        </div>
                        <div className="flex-1 space-y-1.5">
                          <input
                            placeholder="Question label"
                            value={q.label}
                            onChange={(e) => updateQuestion(i, { label: e.target.value })}
                            className="w-full rounded-sm border border-line px-2 py-1.5 text-xs"
                          />
                          <div className="flex items-center gap-2">
                            <select
                              value={q.type}
                              onChange={(e) => updateQuestion(i, { type: e.target.value as SurveyQuestion["type"] })}
                              className="rounded-sm border border-line px-2 py-1 text-xs capitalize"
                            >
                              {QUESTION_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                            <label className="flex items-center gap-1 text-xs text-muted">
                              <input
                                type="checkbox"
                                checked={q.required ?? false}
                                onChange={(e) => updateQuestion(i, { required: e.target.checked })}
                              />
                              Required
                            </label>
                          </div>
                          {q.type === "choice" && (
                            <input
                              placeholder="Options, comma-separated"
                              value={(q.options ?? []).join(", ")}
                              onChange={(e) =>
                                updateQuestion(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })
                              }
                              className="w-full rounded-sm border border-line px-2 py-1.5 text-xs"
                            />
                          )}
                        </div>
                        <button type="button" onClick={() => removeQuestion(i)} className="mt-1.5 text-muted hover:text-brick">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => saveSurvey()}
                  disabled={saving}
                  className="flex-1 rounded-sm border border-line py-2 text-sm font-semibold text-ink disabled:opacity-60"
                >
                  Save
                </button>
                <button
                  onClick={() => saveSurvey("active")}
                  disabled={saving}
                  className="flex-1 rounded-sm bg-[#108A64] py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Save & activate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
