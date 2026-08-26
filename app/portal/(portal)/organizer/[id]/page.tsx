import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { PageHeader } from "@/components/PageHeader";
import { OrganizerForm } from "@/components/portal/OrganizerForm";
import { stringifyAddressValue, stringifyNameValue } from "@/lib/organizer/formatValue";
import type { BasicInfoSnapshot } from "@/components/portal/BasicInfoForm";

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

  const readOnly = response.status === "submitted" || response.status === "reviewed";

  const [{ data: fields }, { data: answers }, { data: snapshot }] = await Promise.all([
    supabase
      .from("organizer_fields")
      .select("id, field_type, label, help_text, is_required, options, parent_field_id, display_order, conditional_logic, client_profile_field")
      .eq("organizer_template_id", response.organizer_template_id)
      .order("display_order"),
    supabase.from("organizer_response_answers").select("organizer_field_id, value, instance_index").eq("organizer_response_id", response.id),
    readOnly ? Promise.resolve({ data: null }) : supabase.rpc("get_portal_client_snapshot"),
  ]);

  // Mapped fields (client_profile_field set on the builder side) that don't
  // already have an answer get one synthesized from the client's record --
  // this only seeds the in-memory form state (OrganizerForm's initial
  // React state), it isn't written to organizer_response_answers until the
  // client actually saves/submits.
  const answeredFieldIds = new Set((answers ?? []).map((a) => a.organizer_field_id));
  const prefillAnswers = !readOnly && snapshot
    ? ((fields ?? []) as { id: string; client_profile_field: string | null }[])
        .filter((f) => f.client_profile_field && !answeredFieldIds.has(f.id))
        .map((f) => ({
          organizer_field_id: f.id,
          instance_index: 0,
          value: prefillValueFor(f.client_profile_field as string, snapshot as BasicInfoSnapshot),
        }))
        .filter((a) => a.value !== null)
    : [];

  const templateName = (response.organizer_templates as unknown as { name?: string } | null)?.name ?? "Organizer";

  return (
    <>
      <PageHeader
        title={templateName}
        description={readOnly ? "This organizer has been submitted and can no longer be edited." : "Fill in what you can -- you can save progress and come back."}
      />
      <div className="max-w-2xl flex-1 px-8 py-6">
        <OrganizerForm
          responseId={response.id}
          templateName={templateName}
          fields={fields ?? []}
          initialAnswers={[...(answers ?? []), ...prefillAnswers]}
          readOnly={readOnly}
          workspaceId={response.workspace_id}
          entityType={response.engagement_id ? "engagement" : "client"}
          entityId={response.engagement_id ?? response.client_id}
        />
      </div>
    </>
  );
}

function prefillValueFor(clientProfileField: string, snapshot: BasicInfoSnapshot): string | null {
  // SSN is never prefilled -- it's an encrypted, staff-reveal-gated value.
  // The client_profile_field='ssn' mapping only proposes a write (subject to
  // review), it doesn't read one back into the form.
  if (clientProfileField === "ssn") return null;
  if (clientProfileField === "full_name") {
    if (!snapshot.first_name && !snapshot.last_name) return null;
    return stringifyNameValue({
      first: snapshot.first_name ?? "",
      middle: snapshot.middle_name ?? "",
      last: snapshot.last_name ?? "",
      suffix: snapshot.suffix ?? "",
    });
  }
  if (clientProfileField === "mailing_address") {
    if (!snapshot.mailing_street && !snapshot.mailing_city && !snapshot.mailing_state && !snapshot.mailing_zip) return null;
    return stringifyAddressValue({
      street: snapshot.mailing_street ?? "",
      street2: "",
      city: snapshot.mailing_city ?? "",
      state: snapshot.mailing_state ?? "",
      zip: snapshot.mailing_zip ?? "",
    });
  }
  const value = (snapshot as unknown as Record<string, string | null>)[clientProfileField];
  return value ?? null;
}
