import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { answerToString } from "@/lib/organizer/formatValue";
import { parseConditionalLogic, shouldShowField } from "@/lib/organizer/conditionalLogic";

type TrackedField = {
  id: string;
  label: string;
  is_required: boolean;
  conditional_logic: unknown;
  document_checklist_name: string | null;
  document_checklist_category: string | null;
};

// Called right after an organizer response is submitted (see OrganizerForm's
// submit()) so the "which required documents are actually missing" list
// builds itself instead of a VA assembling it by hand. Only upload
// questions the organizer builder opted in (include_in_document_checklist)
// AND that conditional logic actually showed to this client are considered
// -- a question hidden by a show-if rule was never asked, so it can't be
// "missing". Re-running this for the same response (e.g. after a
// correction) updates the same document_requests/item rows instead of
// duplicating them.
export async function POST(request: Request) {
  const allowed = await checkRateLimit(`sync-organizer-document-checklist:${clientIp(request)}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const { responseId } = await request.json().catch(() => ({ responseId: null }));
  if (typeof responseId !== "string") {
    return NextResponse.json({ error: "responseId is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: response } = await supabase
    .from("organizer_responses")
    .select("id, workspace_id, client_id, engagement_id, organizer_template_id, status")
    .eq("id", responseId)
    .maybeSingle();

  if (!response) {
    return NextResponse.json({ error: "Organizer response not found" }, { status: 404 });
  }
  if (response.status !== "submitted" && response.status !== "reviewed") {
    return NextResponse.json({ error: "This organizer has not been submitted yet" }, { status: 400 });
  }

  const { data: trackedFields } = await supabase
    .from("organizer_fields")
    .select("id, label, is_required, conditional_logic, document_checklist_name, document_checklist_category")
    .eq("organizer_template_id", response.organizer_template_id)
    .eq("field_type", "file_upload")
    .eq("include_in_document_checklist", true);

  if (!trackedFields || trackedFields.length === 0) {
    return NextResponse.json({ ok: true, skipped: "No document-checklist questions on this organizer" });
  }

  const { data: answers } = await supabase
    .from("organizer_response_answers")
    .select("organizer_field_id, value, organizer_fields(field_type)")
    .eq("organizer_response_id", responseId);

  const answersMap: Record<string, string> = {};
  const rawValueByFieldId = new Map<string, unknown>();
  for (const a of answers ?? []) {
    const fieldType = (a.organizer_fields as unknown as { field_type?: string } | null)?.field_type;
    rawValueByFieldId.set(a.organizer_field_id, a.value);
    if (a.value !== null && a.value !== undefined) {
      answersMap[a.organizer_field_id] = answerToString(fieldType, a.value);
    }
  }

  const visibleTracked = (trackedFields as TrackedField[]).filter((f) =>
    shouldShowField(parseConditionalLogic(f.conditional_logic), answersMap)
  );

  if (visibleTracked.length === 0) {
    return NextResponse.json({ ok: true, skipped: "No tracked questions were shown to this client" });
  }

  let engagementId = response.engagement_id;
  if (!engagementId) {
    const { data: activeEngagement } = await supabase
      .from("engagements")
      .select("id")
      .eq("client_id", response.client_id)
      .not("status", "in", "(Completed,Archived)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    engagementId = activeEngagement?.id ?? null;
  }
  const entityType = engagementId ? "engagement" : "client";
  const entityId = engagementId ?? response.client_id;

  const { data: existingRequest } = await supabase
    .from("document_requests")
    .select("id")
    .eq("organizer_response_id", responseId)
    .maybeSingle();

  let documentRequestId = existingRequest?.id ?? null;
  if (!documentRequestId) {
    const { data: created, error: createError } = await supabase
      .from("document_requests")
      .insert({
        workspace_id: response.workspace_id,
        entity_type: entityType,
        entity_id: entityId,
        organizer_response_id: responseId,
        title: "Documents from submitted organizer",
      })
      .select("id")
      .single();
    if (createError || !created) {
      return NextResponse.json({ error: createError?.message ?? "Could not create the document request" }, { status: 500 });
    }
    documentRequestId = created.id;
  }

  for (const field of visibleTracked) {
    const raw = rawValueByFieldId.get(field.id);
    let attachmentId: string | null = null;
    if (raw && typeof raw === "object") {
      const parsed = raw as { attachment_id?: string };
      attachmentId = parsed.attachment_id ?? null;
    }

    const { data: existingItem } = await supabase
      .from("document_request_item_statuses")
      .select("id")
      .eq("document_request_id", documentRequestId)
      .eq("organizer_field_id", field.id)
      .maybeSingle();

    const itemPatch = {
      document_request_id: documentRequestId,
      organizer_field_id: field.id,
      name: field.document_checklist_name || field.label,
      is_required: field.is_required,
      status: attachmentId ? "uploaded" : "pending",
      fulfilled_by_attachment_id: attachmentId,
    };

    if (existingItem) {
      await supabase.from("document_request_item_statuses").update(itemPatch).eq("id", existingItem.id);
    } else {
      await supabase.from("document_request_item_statuses").insert(itemPatch);
    }
  }

  return NextResponse.json({ ok: true, documentRequestId, itemCount: visibleTracked.length });
}
