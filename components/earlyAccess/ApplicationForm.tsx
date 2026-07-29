"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/friendlyError";
import type { ApplicationQuestion, EarlyAccessCampaign } from "@/lib/earlyAccess/types";

type AnswerValue = string | string[] | boolean | undefined;

// Renders entirely from early_access_settings.application_questions -- no
// question text, options, or required flags are hardcoded here. Question
// keys map 1:1 onto real early_access_applications columns (confirmed
// against the loaded content package), so the submit payload is built by
// iterating the questions rather than a fixed field list.
export default function ApplicationForm({
  campaign,
  workspaceId,
  questions,
  onSubmitted,
}: {
  campaign: EarlyAccessCampaign;
  workspaceId: string | null;
  questions: ApplicationQuestion[];
  onSubmitted: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setAnswer(key: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function toggleMultiselect(key: string, option: string) {
    setAnswers((prev) => {
      const current = (prev[key] as string[] | undefined) ?? [];
      const next = current.includes(option) ? current.filter((o) => o !== option) : [...current, option];
      return { ...prev, [key]: next };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const missing = questions.find((q) => {
      if (!q.required) return false;
      const v = answers[q.key];
      if (q.type === "boolean") return v === undefined;
      if (q.type === "multiselect") return !v || (v as string[]).length === 0;
      return !v || (typeof v === "string" && v.trim() === "");
    });
    if (missing) {
      setError(`Please answer "${missing.label}" before submitting.`);
      return;
    }

    setSubmitting(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) {
      setSubmitting(false);
      setError("Your session expired. Please sign in again.");
      return;
    }

    const payload: Record<string, unknown> = {
      campaign_id: campaign.id,
      workspace_id: workspaceId,
      applicant_user_id: userId,
    };
    for (const q of questions) {
      const v = answers[q.key];
      if (q.type === "number") {
        payload[q.key] = v ? Number(v) : null;
      } else if (q.type === "boolean") {
        payload[q.key] = v === true;
      } else {
        payload[q.key] = v ?? null;
      }
    }

    const { error: insertError } = await supabase.from("early_access_applications").insert(payload);
    setSubmitting(false);
    if (insertError) {
      setError(friendlyError(insertError, "Couldn't submit your application. Please try again."));
      return;
    }
    onSubmitted();
  }

  function renderField(q: ApplicationQuestion) {
    const value = answers[q.key];
    if (q.type === "textarea") {
      return (
        <textarea
          value={(value as string) ?? ""}
          onChange={(e) => setAnswer(q.key, e.target.value)}
          rows={3}
          className="w-full rounded-sm border border-line px-3 py-2 text-sm"
        />
      );
    }
    if (q.type === "boolean") {
      return (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAnswer(q.key, true)}
            className={`rounded-sm border px-3 py-2 text-sm font-semibold ${value === true ? "border-[#108A64] bg-emerald-50 text-[#108A64]" : "border-line text-ink"}`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setAnswer(q.key, false)}
            className={`rounded-sm border px-3 py-2 text-sm font-semibold ${value === false ? "border-[#108A64] bg-emerald-50 text-[#108A64]" : "border-line text-ink"}`}
          >
            No
          </button>
        </div>
      );
    }
    if (q.type === "multiselect") {
      const selected = (value as string[] | undefined) ?? [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {(q.options ?? []).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => toggleMultiselect(q.key, o)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selected.includes(o) ? "border-[#108A64] bg-emerald-50 text-[#108A64]" : "border-line text-ink"}`}
            >
              {o}
            </button>
          ))}
        </div>
      );
    }
    const inputType = q.type === "number" ? "number" : q.type === "email" ? "email" : q.type === "tel" ? "tel" : q.type === "url" ? "url" : "text";
    return (
      <input
        type={inputType}
        value={(value as string) ?? ""}
        onChange={(e) => setAnswer(q.key, e.target.value)}
        className="w-full rounded-sm border border-line px-3 py-2 text-sm"
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {questions.map((q) => (
        <div key={q.key}>
          <label className="text-sm font-semibold text-ink">
            {q.label}
            {q.required && <span className="text-brick"> *</span>}
          </label>
          <div className="mt-1.5">{renderField(q)}</div>
        </div>
      ))}
      {error && (
        <div className="rounded-sm border border-brick/30 bg-brick/10 px-3 py-2 text-xs text-brick">{error}</div>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-sm bg-[#108A64] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {submitting ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}
