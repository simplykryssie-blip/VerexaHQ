import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { PageHeader } from "@/components/PageHeader";
import { OrganizerForm } from "@/components/portal/OrganizerForm";

export const dynamic = "force-dynamic";

export default async function PortalOrganizerDetailPage({ params }: { params: { id: string } }) {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  const { data: response } = await supabase
    .from("organizer_responses")
    .select("id, status, organizer_template_id, workspace_id, client_id, engagement_id, organizer_templates(name)")
    .eq("id", params.id)
    .eq("client_id", identity.clientId)
    .maybeSingle();
  if (!response) notFound();

  const [{ data: fields }, { data: answers }] = await Promise.all([
    supabase
      .from("organizer_fields")
      .select("id, field_type, label, help_text, is_required, options, parent_field_id, display_order")
      .eq("organizer_template_id", response.organizer_template_id)
      .order("display_order"),
    supabase.from("organizer_response_answers").select("organizer_field_id, value, instance_index").eq("organizer_response_id", response.id),
  ]);

  const readOnly = response.status === "submitted" || response.status === "reviewed";

  return (
    <>
      <PageHeader
        title={(response.organizer_templates as unknown as { name?: string } | null)?.name ?? "Organizer"}
        description={readOnly ? "This organizer has been submitted and can no longer be edited." : "Fill in what you can -- you can save progress and come back."}
      />
      <div className="max-w-2xl flex-1 px-8 py-6">
        <OrganizerForm
          responseId={response.id}
          fields={fields ?? []}
          initialAnswers={answers ?? []}
          readOnly={readOnly}
          workspaceId={response.workspace_id}
          entityType={response.engagement_id ? "engagement" : "client"}
          entityId={response.engagement_id ?? response.client_id}
        />
      </div>
    </>
  );
}
