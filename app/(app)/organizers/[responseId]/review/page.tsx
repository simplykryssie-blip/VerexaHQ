import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getWorkspaceStaff } from "@/lib/workspaceStaff";
import {
  buildReviewSections,
  buildAwaitingReviewItems,
  type ReviewAnswerRow,
  type ReviewFieldRow,
  type ReviewPendingChangeRow,
  type OpenInfoRequestItemRow,
} from "@/lib/organizer/buildReviewSections";
import { ReviewWorkspace } from "./ReviewWorkspace";

export const dynamic = "force-dynamic";

function clientLabel(c: { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null } | null) {
  if (!c) return "Client";
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export default async function OrganizerReviewPage({ params }: { params: { responseId: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const { data: response } = await supabase
    .from("organizer_responses")
    .select(
      `id, workspace_id, status, submitted_at, organizer_template_id, client_id, engagement_id,
       review_status, review_note, reviewed_at, assigned_reviewer_id,
       organizer_templates(name),
       clients(client_type, first_name, last_name, business_name, primary_email, primary_phone),
       engagements(id, engagement_number, engagement_tax_details!engagement_tax_details_engagement_id_fkey(tax_year))`
    )
    .eq("id", params.responseId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (!response) notFound();
  if (response.status !== "submitted" && response.status !== "reviewed") {
    redirect(response.engagement_id ? `/engagements/${response.engagement_id}` : `/clients/${response.client_id}`);
  }

  const { data: canReview } = await supabase.rpc("has_permission", {
    p_workspace_id: workspace.id,
    p_permission_key: "organizers.review",
  });
  if (!canReview) {
    redirect(response.engagement_id ? `/engagements/${response.engagement_id}` : `/clients/${response.client_id}`);
  }

  const [{ data: canApprove }, { data: canDeny }, { data: canRequestInfo }, { data: canEroReview }] = await Promise.all([
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "organizers.review_approve" }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "organizers.review_deny" }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "organizers.review_request_info" }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "organizers.review_ero" }),
  ]);

  const entityType: "engagement" | "client" = response.engagement_id ? "engagement" : "client";
  const entityId = response.engagement_id ?? response.client_id;

  const [
    { data: fieldRows },
    { data: answerRows },
    { data: pendingChangeRows },
    { data: infoRequestRows },
    { data: noteRows },
    { data: documentRequestRows },
    { data: documentRequestTemplates },
    { data: activityRows },
    staffMembers,
  ] = await Promise.all([
    supabase
      .from("organizer_fields")
      .select("id, label, help_text, field_type, is_required, options, parent_field_id, display_order, conditional_logic, client_profile_field")
      .eq("organizer_template_id", response.organizer_template_id)
      .order("display_order"),
    supabase
      .from("organizer_response_answers")
      .select("id, organizer_field_id, value, instance_index, review_status, review_note")
      .eq("organizer_response_id", response.id),
    supabase
      .from("client_pending_changes")
      .select("id, organizer_field_id, target_column, old_value, new_value, new_value_last4")
      .eq("organizer_response_id", response.id)
      .eq("status", "pending"),
    supabase
      .from("organizer_information_requests")
      .select(
        `id, message, status, due_date, tags, sent_via_email, sent_via_sms, shown_in_portal, created_at, viewed_at, responded_at, resolved_at,
         items:organizer_information_request_items(id, organizer_field_id, instance_index, note, status, was_answered_when_flagged, proposed_value, decision_note, created_at, resolved_at)`
      )
      .eq("organizer_response_id", response.id)
      .order("created_at", { ascending: false }),
    // Notes taken while reviewing land on the engagement's (or client's, if
    // there's no engagement) own Notes tab -- same entityType/entityId as
    // document_requests below -- rather than a third, siloed
    // "organizer_response" bucket nothing else ever reads.
    supabase
      .from("notes")
      .select("id, subject, body, author_id, created_at")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false }),
    supabase
      .from("document_requests")
      .select(`id, title, due_date, status, created_at, document_request_template_id, items:document_request_item_statuses(id, name, is_required, status)`)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false }),
    supabase.from("document_request_templates").select("id, name").eq("workspace_id", workspace.id).eq("status", "published").order("name"),
    supabase
      .from("activity_log")
      .select("id, description, activity_type, created_at, metadata")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .in("activity_type", ["ORGANIZER_SUBMITTED", "ORGANIZER_REVIEWED", "ORGANIZER_ANSWER_REVIEWED", "ORGANIZER_INFO_REQUESTED", "ORGANIZER_INFO_RESOLVED"])
      .order("created_at", { ascending: false })
      .limit(100),
    getWorkspaceStaff(supabase, workspace.id),
  ]);

  const activity = (activityRows ?? []).filter((a) => {
    const meta = a.metadata as Record<string, unknown> | null;
    return !meta?.response_id || meta.response_id === response.id;
  });

  const authorIds = Array.from(new Set((noteRows ?? []).map((n) => n.author_id).filter((id): id is string => Boolean(id))));
  const staffById = new Map(staffMembers.map((s) => [s.user_id, s]));

  type InfoRequestItemRow = {
    id: string;
    organizer_field_id: string;
    instance_index: number;
    note: string | null;
    status: "pending" | "client_responded" | "approved" | "rejected" | "resolved";
    was_answered_when_flagged: boolean;
    proposed_value: unknown;
    decision_note: string | null;
    created_at: string;
    resolved_at: string | null;
  };
  type InfoRequestRow = {
    id: string;
    message: string | null;
    status: "draft" | "active" | "viewed" | "responded" | "resolved";
    due_date: string | null;
    tags: string[];
    sent_via_email: boolean;
    sent_via_sms: boolean;
    shown_in_portal: boolean;
    created_at: string;
    viewed_at: string | null;
    responded_at: string | null;
    resolved_at: string | null;
    items: InfoRequestItemRow[];
  };

  const infoRequests = (infoRequestRows ?? []) as unknown as InfoRequestRow[];
  const allItems = infoRequests.flatMap((r) => r.items);
  const openInfoItems: OpenInfoRequestItemRow[] = allItems
    .filter((i) => i.status === "pending" || i.status === "client_responded")
    .map((i) => ({ id: i.id, organizer_field_id: i.organizer_field_id, instance_index: i.instance_index, status: i.status as "pending" | "client_responded", note: i.note }));

  const sections = buildReviewSections(
    (fieldRows ?? []) as ReviewFieldRow[],
    (answerRows ?? []) as ReviewAnswerRow[],
    (pendingChangeRows ?? []) as ReviewPendingChangeRow[],
    openInfoItems
  );

  const awaitingReviewItems = buildAwaitingReviewItems((fieldRows ?? []) as ReviewFieldRow[], (answerRows ?? []) as ReviewAnswerRow[], allItems);

  const draftRequest = infoRequests.find((r) => r.status === "draft") ?? null;

  const client = response.clients as unknown as {
    client_type: string;
    first_name: string | null;
    last_name: string | null;
    business_name: string | null;
    primary_email: string | null;
    primary_phone: string | null;
  } | null;
  const engagement = response.engagements as unknown as {
    id: string;
    engagement_number: string | null;
    engagement_tax_details: { tax_year: number | null } | { tax_year: number | null }[] | null;
  } | null;
  const taxYear = engagement
    ? (Array.isArray(engagement.engagement_tax_details) ? engagement.engagement_tax_details[0]?.tax_year : engagement.engagement_tax_details?.tax_year) ?? null
    : null;

  return (
    <ReviewWorkspace
      workspaceId={workspace.id}
      response={{
        id: response.id,
        status: response.status,
        submittedAt: response.submitted_at,
        templateName: (response.organizer_templates as unknown as { name?: string } | null)?.name ?? "Organizer",
        reviewStatus: response.review_status,
        assignedReviewerId: response.assigned_reviewer_id,
        clientId: response.client_id,
        engagementId: response.engagement_id,
      }}
      clientName={clientLabel(client)}
      clientEmail={client?.primary_email ?? null}
      engagementNumber={engagement?.engagement_number ?? null}
      taxYear={taxYear}
      sections={sections}
      infoRequests={infoRequests.map((r) => ({
        id: r.id,
        message: r.message,
        status: r.status,
        due_date: r.due_date,
        tags: r.tags,
        created_at: r.created_at,
        viewed_at: r.viewed_at,
        responded_at: r.responded_at,
        resolved_at: r.resolved_at,
      }))}
      draftRequestId={draftRequest?.id ?? null}
      draftItems={(draftRequest?.items ?? []).map((i) => ({
        id: i.id,
        organizer_field_id: i.organizer_field_id,
        instance_index: i.instance_index,
        note: i.note ?? "",
        label: (() => {
          const field = (fieldRows ?? []).find((f) => f.id === i.organizer_field_id);
          const parent = field?.parent_field_id ? (fieldRows ?? []).find((f) => f.id === field.parent_field_id) : null;
          return parent ? `${parent.label} ${i.instance_index + 1} -- ${field?.label ?? "Question"}` : field?.label ?? "Question";
        })(),
      }))}
      awaitingReviewItems={awaitingReviewItems}
      notes={(noteRows ?? []).map((n) => ({ ...n, authorName: n.author_id ? staffById.get(n.author_id)?.display_name ?? "Staff" : "Staff" }))}
      documentRequests={(documentRequestRows ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        due_date: r.due_date,
        status: r.status as "open" | "completed" | "cancelled",
        created_at: r.created_at,
        items: (r.items ?? []) as never,
      }))}
      documentRequestTemplates={documentRequestTemplates ?? []}
      entityType={entityType}
      entityId={entityId}
      activity={activity}
      staffOptions={staffMembers.map((s) => ({ id: s.user_id, display_name: s.display_name }))}
      canApprove={Boolean(canApprove)}
      canDeny={Boolean(canDeny)}
      canRequestInfo={Boolean(canRequestInfo)}
      canEroReview={Boolean(canEroReview)}
    />
  );
}
