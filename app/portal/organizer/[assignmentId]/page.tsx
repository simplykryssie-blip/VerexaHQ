"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { supabasePortal } from "@/lib/supabasePortal";
import type { OrganizerResponse, OrganizerField, OrganizerResponseAnswer, OrganizerTemplate } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import OrganizerQuestionnaire from "@/components/OrganizerQuestionnaire";
import OrganizerProgress from "@/components/OrganizerProgress";
import { isFieldAnswered, isFieldVisible } from "@/lib/organizerVisibility";
import { friendlyOrganizerError } from "@/lib/organizerError";

export default function PortalOrganizerPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const router = useRouter();

  const [response, setResponse] = useState<OrganizerResponse | null>(null);
  const [template, setTemplate] = useState<OrganizerTemplate | null>(null);
  const [fields, setFields] = useState<OrganizerField[]>([]);
  const [answers, setAnswers] = useState<Map<string, OrganizerResponseAnswer>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingFieldId, setSavingFieldId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const { data: responseData, error: responseError } = await supabasePortal
      .from("organizer_responses")
      .select("*")
      .eq("id", assignmentId)
      .maybeSingle();

    if (responseError || !responseData) {
      setError(friendlyOrganizerError(responseError, "We couldn't find this organizer. Please check the link or contact your preparer."));
      setLoading(false);
      return;
    }

    const r = responseData as OrganizerResponse;
    setResponse(r);

    const [templateRes, fieldsRes, answersRes] = await Promise.all([
      supabasePortal.from("organizer_templates").select("*").eq("id", r.organizer_template_id).maybeSingle(),
      supabasePortal.from("organizer_fields").select("*").eq("organizer_template_id", r.organizer_template_id).order("display_order"),
      supabasePortal.from("organizer_response_answers").select("*").eq("organizer_response_id", r.id),
    ]);

    setTemplate((templateRes.data as OrganizerTemplate) ?? null);
    setFields((fieldsRes.data as OrganizerField[]) ?? []);

    const answersMap = new Map<string, OrganizerResponseAnswer>();
    (answersRes.data as OrganizerResponseAnswer[] | null)?.forEach((ans) => answersMap.set(ans.organizer_field_id, ans));
    setAnswers(answersMap);
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    if (assignmentId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  async function saveAnswer(field: OrganizerField, value: unknown) {
    if (!response) return;
    setSavingFieldId(field.id);

    if (response.status === "not_started") {
      await supabasePortal.from("organizer_responses").update({ status: "in_progress" }).eq("id", response.id);
      setResponse((prev) => (prev ? { ...prev, status: "in_progress" } : prev));
    }

    const { data: saved, error } = await supabasePortal
      .from("organizer_response_answers")
      .upsert(
        { organizer_response_id: response.id, organizer_field_id: field.id, value },
        { onConflict: "organizer_response_id,organizer_field_id" },
      )
      .select()
      .single();

    if (!error && saved) {
      setAnswers((prev) => new Map(prev).set(field.id, saved as OrganizerResponseAnswer));
    }
    setSavingFieldId(null);
  }

  async function submitForReview() {
    if (!response) return;
    const topLevelFields = fields.filter((f) => !f.parent_field_id && isFieldVisible(f, fields, answers));
    const missing = topLevelFields.filter((f) => f.is_required && !isFieldAnswered(answers.get(f.id)?.value));
    if (missing.length > 0) {
      setError(`Please answer ${missing.length} more required question${missing.length === 1 ? "" : "s"} before submitting.`);
      return;
    }
    setSubmitting(true);
    const { error: submitError } = await supabasePortal
      .from("organizer_responses")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", response.id);
    setSubmitting(false);
    if (submitError) {
      setError(friendlyOrganizerError(submitError, "We couldn't submit your organizer right now. Please try again in a moment."));
      return;
    }
    setResponse({ ...response, status: "submitted", submitted_at: new Date().toISOString() });
    setError(null);
  }

  if (loading) return <div className="text-sm text-muted">Loading…</div>;

  if (error || !response) {
    return <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3">{error ?? "Not found."}</div>;
  }

  const topLevelFields = fields.filter((f) => !f.parent_field_id && isFieldVisible(f, fields, answers));
  const answeredCount = topLevelFields.filter((f) =>
    f.field_type === "repeating_section" ? Array.isArray(answers.get(f.id)?.value) && (answers.get(f.id)!.value as unknown[]).length > 0 : isFieldAnswered(answers.get(f.id)?.value),
  ).length;

  const canEdit = response.status === "not_started" || response.status === "in_progress";

  return (
    <div>
      <button onClick={() => router.push("/portal")} className="flex items-center gap-1.5 text-xs text-muted mb-4 hover:text-ink">
        <ArrowLeft size={13} /> Back to Home
      </button>

      <div className="flex items-center gap-3 mb-1">
        <h1 className="font-slab text-2xl font-bold text-ink">{template?.name}</h1>
        <StatusPill status={response.status.replaceAll("_", " ")} />
      </div>
      <p className="text-sm text-muted mb-4">
        We&apos;ll ask a few questions so we can prepare your return correctly. Answer what you know now — you can always
        come back and finish later.
      </p>

      <OrganizerProgress answeredCount={answeredCount} totalCount={topLevelFields.length} />

      {error && <div className="mb-6 text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3">{error}</div>}

      <OrganizerQuestionnaire fields={fields} answers={answers} savingFieldId={savingFieldId} onSave={saveAnswer} />

      {canEdit && (
        <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-xs text-muted flex-1">Your answers save automatically. Submit only when the organizer is complete.</p>
          <button type="button" onClick={submitForReview} disabled={submitting} className="px-4 py-2 rounded-sm bg-ink text-white text-sm font-semibold disabled:opacity-60">
            {submitting ? "Submitting…" : "Submit for Review"}
          </button>
        </div>
      )}
    </div>
  );
}
