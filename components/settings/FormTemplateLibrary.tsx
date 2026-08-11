import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LayoutTemplate } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { OrganizerLibrary, type OrganizerCard } from "@/components/settings/organizer-builder/OrganizerLibrary";
import { EngagementLetterLibrary, type EngagementLetterCard } from "@/components/settings/engagement-letter-editor/EngagementLetterLibrary";

export type FormTemplateTabKey = "engagement-letter" | "organizers";

// Split out from the old generic TemplateLibrary so this route's bundle never
// pulls in the Email/SMS composer's Tiptap dependency -- see EmailSmsLibrary
// for that side.
export async function FormTemplateLibrary({ workspaceId, activeTabParam }: { workspaceId: string; activeTabParam?: string }) {
  const activeTab: FormTemplateTabKey = activeTabParam === "organizers" ? "organizers" : "engagement-letter";
  const isOrganizers = activeTab === "organizers";

  const supabase = createClient();
  const orFilter = `workspace_id.is.null,workspace_id.eq.${workspaceId}`;

  const { data: engagementLetterTemplates } = !isOrganizers
    ? await supabase.from("engagement_letter_templates").select("id, name, status, workspace_id, requires_signature, merge_fields").or(orFilter).order("name")
    : { data: null };

  const engagementLetterCards: EngagementLetterCard[] = (engagementLetterTemplates ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    workspace_id: t.workspace_id,
    requires_signature: t.requires_signature,
    merge_field_count: Array.isArray(t.merge_fields) ? t.merge_fields.length : 0,
  }));

  const { data: organizerTemplates } = isOrganizers
    ? await supabase.from("organizer_templates").select("*").or(orFilter).order("name")
    : { data: null };

  const organizerTemplateIds = (organizerTemplates ?? []).map((t) => t.id);
  const { data: organizerFields } =
    isOrganizers && organizerTemplateIds.length > 0
      ? await supabase.from("organizer_fields").select("id, organizer_template_id, parent_field_id").in("organizer_template_id", organizerTemplateIds)
      : { data: [] as { id: string; organizer_template_id: string; parent_field_id: string | null }[] };

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
    };
  });

  const { data: jotformConnected } = isOrganizers ? await supabase.rpc("is_workspace_jotform_connected", { p_workspace_id: workspaceId }) : { data: false };

  const tabs: { key: FormTemplateTabKey; label: string }[] = [
    { key: "engagement-letter", label: "Engagement Letters" },
    { key: "organizers", label: "Organizers" },
  ];

  return (
    <div className="max-w-6xl">
      <SettingsSectionHeader
        icon={LayoutTemplate}
        title="Form Templates"
        description="Engagement letter and organizer templates. See Email & SMS in the Templates menu for message templates."
      />

      <div className="mt-4">
        <nav className="flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/templates?tab=${t.key}`}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                activeTab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-4">
        {isOrganizers ? (
          <OrganizerLibrary workspaceId={workspaceId} templates={organizerCards} isJotformConnected={Boolean(jotformConnected)} />
        ) : (
          <EngagementLetterLibrary workspaceId={workspaceId} templates={engagementLetterCards} />
        )}
      </div>
    </div>
  );
}
