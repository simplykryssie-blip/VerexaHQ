"use client";
import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useEarlyAccessMembership } from "@/lib/earlyAccess/useEarlyAccessMembership";
import { friendlyError } from "@/lib/friendlyError";
import { useToast } from "@/components/Toast";
import type { EarlyAccessSurvey, SurveyQuestion } from "@/lib/earlyAccess/types";

const SCALE_10 = Array.from({ length: 10 }, (_, i) => i + 1);
const SCALE_0_10 = Array.from({ length: 11 }, (_, i) => i);

export default function WorkspaceSurveysPage() {
  const { activeWorkspaceId } = useWorkspace();
  const { loading: membershipLoading, inProgram, campaign } = useEarlyAccessMembership(activeWorkspaceId);
  const { showSuccess, showError } = useToast();
  const [surveys, setSurveys] = useState<EarlyAccessSurvey[]>([]);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<EarlyAccessSurvey | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!campaign || !activeWorkspaceId) return;
    setLoading(true);
    setError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    const { data, error: surveysError } = await supabase
      .from("early_access_surveys")
      .select("*")
      .eq("campaign_id", campaign.id)
      .eq("status", "active");
    if (surveysError) {
      setError(friendlyError(surveysError, "Couldn't load surveys."));
      setLoading(false);
      return;
    }
    const list = (data as EarlyAccessSurvey[]) ?? [];
    setSurveys(list);

    if (userId && list.length > 0) {
      const { data: responses } = await supabase
        .from("early_access_survey_responses")
        .select("survey_id")
        .eq("user_id", userId)
        .in("survey_id", list.map((s) => s.id));
      setAnsweredIds(new Set((responses ?? []).map((r) => r.survey_id as string)));
    }
    setLoading(false);
  }, [campaign, activeWorkspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openSurvey(s: EarlyAccessSurvey) {
    setActive(s);
    setAnswers({});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!active || !activeWorkspaceId || !campaign) return;
    const missing = active.questions.some((q) => q.required && !answers[q.key]?.trim());
    if (missing) {
      showError("Please answer all required questions.");
      return;
    }
    setSubmitting(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) {
      setSubmitting(false);
      showError("Your session expired. Please sign in again.");
      return;
    }

    const satisfactionQuestion = active.questions.find((q) => q.type === "satisfaction");
    const npsQuestion = active.questions.find((q) => q.type === "nps");

    const { error: insertError } = await supabase.from("early_access_survey_responses").insert({
      survey_id: active.id,
      campaign_id: campaign.id,
      workspace_id: activeWorkspaceId,
      user_id: userId,
      answers,
      satisfaction_score: satisfactionQuestion ? Number(answers[satisfactionQuestion.key]) || null : null,
      nps_score: npsQuestion ? Number(answers[npsQuestion.key]) : null,
    });
    setSubmitting(false);
    if (insertError) {
      showError(friendlyError(insertError, "Couldn't submit your response. It may already be recorded."));
      return;
    }
    showSuccess("Thanks for your feedback!");
    setActive(null);
    void load();
  }

  function renderQuestion(q: SurveyQuestion) {
    if (q.type === "satisfaction") {
      return (
        <div className="flex flex-wrap gap-1.5">
          {SCALE_10.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setAnswers((prev) => ({ ...prev, [q.key]: String(n) }))}
              className={`h-9 w-9 rounded-lg border text-sm font-semibold ${answers[q.key] === String(n) ? "border-[#108A64] bg-emerald-50 text-[#108A64]" : "border-line text-ink"}`}
            >
              {n}
            </button>
          ))}
        </div>
      );
    }
    if (q.type === "nps") {
      return (
        <div className="flex flex-wrap gap-1.5">
          {SCALE_0_10.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setAnswers((prev) => ({ ...prev, [q.key]: String(n) }))}
              className={`h-9 w-9 rounded-lg border text-sm font-semibold ${answers[q.key] === String(n) ? "border-[#108A64] bg-emerald-50 text-[#108A64]" : "border-line text-ink"}`}
            >
              {n}
            </button>
          ))}
        </div>
      );
    }
    if (q.type === "choice") {
      return (
        <select
          value={answers[q.key] ?? ""}
          onChange={(e) => setAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))}
          className="w-full rounded-sm border border-line px-3 py-2 text-sm"
        >
          <option value="">Select…</option>
          {(q.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    return (
      <textarea
        value={answers[q.key] ?? ""}
        onChange={(e) => setAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))}
        rows={3}
        className="w-full rounded-sm border border-line px-3 py-2 text-sm"
      />
    );
  }

  if (membershipLoading || loading) return <p className="text-muted">Loading…</p>;
  if (!inProgram || !campaign) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
        Surveys are available once your workspace has joined an Early Access program.
      </div>
    );
  }
  if (error) return <div className="rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>;

  const pending = surveys.filter((s) => !answeredIds.has(s.id));
  const completed = surveys.filter((s) => answeredIds.has(s.id));

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Surveys</h1>
      <p className="mt-1 text-sm text-muted">Quick feedback that helps us improve VerexaHQ.</p>

      {pending.length === 0 && completed.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">No surveys are open right now.</div>
      ) : (
        <div className="mt-5 space-y-3">
          {pending.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-2xl border border-[#108A64] bg-emerald-50/40 p-4">
              <div>
                <div className="font-semibold text-ink">{s.name}</div>
                {s.description && <p className="mt-1 text-sm text-muted">{s.description}</p>}
              </div>
              <button onClick={() => openSurvey(s)} className="rounded-xl bg-[#108A64] px-3.5 py-2 text-sm font-semibold text-white">
                Take survey
              </button>
            </div>
          ))}
          {completed.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-2xl border border-line bg-white p-4 opacity-70">
              <div className="font-semibold text-ink">{s.name}</div>
              <span className="text-xs font-semibold text-muted">Completed</span>
            </div>
          ))}
        </div>
      )}

      {active && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-sm border border-line bg-white p-6">
            <div className="mb-4 flex items-start justify-between">
              <h3 className="font-slab text-lg font-bold text-ink">{active.name}</h3>
              <button onClick={() => setActive(null)} className="text-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {active.questions.map((q) => (
                <div key={q.key}>
                  <label className="text-sm font-semibold text-ink">
                    {q.label}
                    {q.required && <span className="text-brick"> *</span>}
                  </label>
                  <div className="mt-1.5">{renderQuestion(q)}</div>
                </div>
              ))}
              <button type="submit" disabled={submitting} className="w-full rounded-sm bg-ink py-2 text-sm font-semibold text-white disabled:opacity-60">
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
