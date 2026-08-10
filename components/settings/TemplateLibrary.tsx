import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { type LucideIcon } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { EmailSmsTemplateGallery } from "@/components/settings/EmailSmsTemplateGallery";
import { OrganizerLibrary, type OrganizerCard } from "@/components/settings/organizer-builder/OrganizerLibrary";
import { EngagementLetterLibrary, type EngagementLetterCard } from "@/components/settings/engagement-letter-editor/EngagementLetterLibrary";

export type TemplateTabKey = "email" | "sms" | "engagement-letter" | "organizers";
export type TemplateTab = { key: TemplateTabKey; label: string };

export async function TemplateLibrary({
  workspaceId,
  basePath,
  tabs,
  heading,
  description,
  icon,
  activeTabParam,
}: {
  workspaceId: string;
  basePath: string;
  tabs: TemplateTab[];
  heading: string;
  description: string;
  icon: LucideIcon;
  activeTabParam?: string;
}) {
  const activeTab: TemplateTabKey = tabs.some((t) => t.key === activeTabParam) ? (activeTabParam as TemplateTabKey) : tabs[0].key;

  const supabase = createClient();
  const orFilter = `workspace_id.is.null,workspace_id.eq.${workspaceId}`;
  const isOrganizers = activeTab === "organizers";
  const isEngagementLetters = activeTab === "engagement-letter";
  const table = activeTab === "email" ? "email_templates" : activeTab === "sms" ? "sms_templates" : "engagement_letter_templates";

  const { data: templates } = isOrganizers || isEngagementLetters
    ? { data: null }
    : await supabase.from(table).select("*").or(orFilter).order("name");

  const { data: engagementLetterTemplates } = isEngagementLetters
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

  const tabNav = (
    <nav className="flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`${basePath}?tab=${t.key}`}
          className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
            activeTab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="max-w-6xl">
      <SettingsSectionHeader icon={icon} title={heading} description={description} />

      <div className="mt-4">{tabNav}</div>

      {isOrganizers ? (
        <div className="mt-4">
          <OrganizerLibrary workspaceId={workspaceId} templates={organizerCards} />
        </div>
      ) : isEngagementLetters ? (
        <div className="mt-4">
          <EngagementLetterLibrary workspaceId={workspaceId} templates={engagementLetterCards} />
        </div>
      ) : (
        <div className="mt-4">
          <EmailSmsTemplateGallery kind={activeTab as "email" | "sms"} workspaceId={workspaceId} templates={templates ?? []} />
        </div>
      )}
    </div>
  );
}
