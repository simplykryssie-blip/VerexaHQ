"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { OrganizerResponse, OrganizerField, OrganizerResponseAnswer, Client, OrganizerTemplate } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import OrganizerQuestionnaire from "@/components/OrganizerQuestionnaire";
import OrganizerProgress from "@/components/OrganizerProgress";
import { isFieldAnswered, isFieldVisible } from "@/lib/organizerVisibility";
import { friendlyOrganizerError } from "@/lib/organizerError";

const STATUS_STEPS = ["not_started", "in_progress", "submitted", "reviewed"];

export default function OrganizerFillPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [response, setResponse] = useState<OrganizerResponse | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [template, setTemplate] = useState<OrganizerTemplate | null>(null);
  const [fields, setFields] = useState<OrganizerField[]>([]);
  const [answers, setAnswers] = useState<Map<string, OrganizerResponseAnswer>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingFieldId, setSavingFieldId] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function load() {
    setLoading(true);
    const { data: responseData, error: responseError } = await supabase
      .from("organizer_responses")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (responseError || !responseData) {
      setError(friendlyOrganizerError(responseError, "We couldn't load this organizer. Please try again."));
      setLoading(false);
      return;
    }

    const r = responseData as OrganizerResponse;
    setResponse(r);

    const [clientRes, templateRes, fieldsRes, answersRes] = await Promise.all([
      supabase.from("clients").select("*").eq("id", r.client_id).maybeSingle(),
      supabase.from("organizer_templates").select("*").eq("id", r.organizer_template_id).maybeSingle(),
      supabase.from("organizer_fields").select("*").eq("organizer_template_id", r.organizer_template_id).order("display_order"),
      supabase.from("organizer_response_answers").select("*").eq("organizer_response_id", r.id),
    ]);

    setClient((clientRes.data as Client) ?? null);
    setTemplate((templateRes.data as OrganizerTemplate) ?? null);
    setFields((fieldsRes.data as OrganizerField[]) ?? []);

    const answersMap = new Map<string, OrganizerResponseAnswer>();
    (answersRes.data as OrganizerResponseAnswer[] | null)?.forEach((ans) => answersMap.set(ans.organizer_field_id, ans));
    setAnswers(answersMap);

    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveAnswer(field: OrganizerField, value: unknown) {
    if (!response) return;
    setSavingFieldId(field.id);

    const { data: saved, error } = await supabase
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

  async function advanceStatus(nextStatus: string) {
    if (!response) return;
    setUpdatingStatus(true);
    const payload: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === "reviewed") payload.reviewed_at = new Date().toISOString();

    const { error } = await supabase.from("organizer_responses").update(payload).eq("id", response.id);
    setUpdatingStatus(false);
    if (!error) {
      setResponse({ ...response, ...payload } as OrganizerResponse);
    }
  }

  if (loading) {
    return <div className="text-sm text-muted">Loading organizer…</div>;
  }

  if (error || !response) {
    return (
      <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3">
        {error ?? "Not found."}
      </div>
    );
  }

  const clientName = client
    ? client.client_type === "business" && client.business_name
      ? client.business_name
      : `${client.first_name} ${client.last_name}`.trim()
    : "—";

  const currentStepIndex = STATUS_STEPS.indexOf(response.status);
  const nextStatus = STATUS_STEPS[currentStepIndex + 1];

  const topLevelFields = fields.filter((f) => !f.parent_field_id && isFieldVisible(f, fields, answers));
  const answeredCount = topLevelFields.filter((f) =>
    f.field_type === "repeating_section" ? Array.isArray(answers.get(f.id)?.value) && (answers.get(f.id)!.value as unknown[]).length > 0 : isFieldAnswered(answers.get(f.id)?.value),
  ).length;

  return (
    <div>
      <button onClick={() => router.push("/tax/organizers")} className="flex items-center gap-1.5 text-xs text-muted mb-4 hover:text-ink">
        <ArrowLeft size={13} /> Back to Organizers
      </button>

      <div className="flex items-center gap-3 mb-2">
        <h1 className="font-slab text-2xl font-bold text-ink">{clientName}</h1>
        <StatusPill status={response.status.replaceAll("_", " ")} />
      </div>
      <div className="text-sm text-muted mb-6">{template?.name}</div>

      <div className="flex items-center gap-2 mb-8">
        {nextStatus && (
          <button
            onClick={() => advanceStatus(nextStatus)}
            disabled={updatingStatus}
            className="text-xs font-semibold px-3 py-1.5 rounded-sm bg-ink text-white disabled:opacity-60"
          >
            {updatingStatus ? "Updating…" : `Mark as ${nextStatus.replaceAll("_", " ")}`}
          </button>
        )}
      </div>

      <OrganizerProgress answeredCount={answeredCount} totalCount={topLevelFields.length} />

      <OrganizerQuestionnaire fields={fields} answers={answers} savingFieldId={savingFieldId} onSave={saveAnswer} />
    </div>
  );
}
