import { createClient } from "@/lib/supabase/server";
import { LayoutTemplate } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { FormTemplateLibraryList } from "@/components/settings/FormTemplateLibraryList";
import type { OrganizerCard, EngagementLetterCard } from "@/components/settings/formTemplateTypes";

// One flat list -- a combined (signable) template is just an organizer
// template with a rich_text block and a signature field, not a separate
// underlying kind, so staff shouldn't have to know which tab it lives under.
export async function FormTemplateLibrary({ workspaceId }: { workspaceId: string }) {
  const supabase = createClient();
  const orFilter = `workspace_id.is.null,workspace_id.eq.${workspaceId}`;

  const [{ data: engagementLetterTemplates }, { data: organizerTemplates }, { data: jotformConnected }] = await Promise.all([
    supabase.from("engagement_letter_templates").select("id, name, status, workspace_id, requires_signature, merge_fields").or(orFilter).order("name"),
    supabase.from("organizer_templates").select("id, name, description, status, workspace_id").or(orFilter).order("name"),
    supabase.rpc("is_workspace_jotform_connected", { p_workspace_id: workspaceId }),
  ]);

  const organizerTemplateIds = (organizerTemplates ?? []).map((t) => t.id);
  const { data: organizerFields } =
    organizerTemplateIds.length > 0
      ? await supabase.from("organizer_fields").select("id, organizer_template_id, parent_field_id, field_type").in("organizer_template_id", organizerTemplateIds)
      : { data: [] as { id: string; organizer_template_id: string; parent_field_id: string | null; field_type: string }[] };

  const engagementLetterCards: EngagementLetterCard[] = (engagementLetterTemplates ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    workspace_id: t.workspace_id,
    requires_signature: t.requires_signature,
    merge_field_count: Array.isArray(t.merge_fields) ? t.merge_fields.length : 0,
  }));

  const organizerCards: OrganizerCard[] = (organizerTemplates ?? []).map((t) => {
    const fieldsForTemplate = (organizerFields ?? []).filter((f) => f.organizer_template_id === t.id);
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      status: t.status,
      workspace_id: t.workspace_id,
      topLevelFieldCount: fieldsForTemplate.filter((f) => !f.parent_field_id).length,
      totalFieldCount: fieldsForTemplate.length,
      hasSignature: fieldsForTemplate.some((f) => f.field_type === "signature"),
    };
  });

  return (
    <div className="max-w-6xl">
      <SettingsSectionHeader
        icon={LayoutTemplate}
        title="Form Templates"
        description="Intake questions, terms/legal text, and signatures -- all in one linear form. See Email & SMS in the Templates menu for message templates."
      />

      <div className="mt-4">
        <FormTemplateLibraryList
          workspaceId={workspaceId}
          organizerTemplates={organizerCards}
          engagementLetterTemplates={engagementLetterCards}
          isJotformConnected={Boolean(jotformConnected)}
        />
      </div>
    </div>
  );
}
