import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FileText, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { CreateTemplateForm } from "@/components/settings/CreateTemplateForm";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { TemplateEditRow } from "@/components/settings/TemplateEditRow";
import { OrganizerLibrary, type OrganizerCard } from "@/components/settings/organizer-builder/OrganizerLibrary";
import { EngagementLetterLibrary, type EngagementLetterCard } from "@/components/settings/engagement-letter-editor/EngagementLetterLibrary";

export type TemplateTabKey = "email" | "sms" | "engagement-letter" | "organizers";
export type TemplateTab = { key: TemplateTabKey; label: string };

function mergeFieldTokens(text: string) {
  const matches = text.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? [];
  return Array.from(new Set(matches));
}

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
    <div className={isOrganizers || isEngagementLetters ? "max-w-6xl" : "max-w-3xl"}>
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
        <>
          <div className="mt-4">
            <CreateTemplateForm workspaceId={workspaceId} kind={activeTab} />
          </div>

          <div className="mt-4">
            {(templates ?? []).length === 0 ? (
              <EmptyState icon={FileText} message="No templates yet." />
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
                {(templates ?? []).map((t: any) => {
                  const bodyText = t.body_html ?? t.body ?? "";
                  const tokens = mergeFieldTokens(`${t.subject ?? ""} ${bodyText}`);
                  return (
                    <li key={t.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <TemplateEditRow kind={activeTab} template={t} />
                            {!t.workspace_id && <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">System</span>}
                          </div>
                          <p className="text-xs text-muted">{t.slug}</p>
                        </div>
                        <TemplateStatusCycle table={table} id={t.id} status={t.status} />
                      </div>
                      {tokens.length > 0 && (
                        <p className="mt-1.5 flex flex-wrap gap-1 text-xs text-muted">
                          {tokens.map((tok) => (
                            <span key={tok} className="rounded bg-surfaceMuted px-1.5 py-0.5">
                              {tok}
                            </span>
                          ))}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
