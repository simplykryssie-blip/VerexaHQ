import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/EmptyState";
import { CreateTemplateForm } from "@/components/settings/CreateTemplateForm";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { TemplateEditRow } from "@/components/settings/TemplateEditRow";
import { CreateOrganizerTemplateForm } from "@/components/settings/CreateOrganizerTemplateForm";
import { OrganizerTemplateRow } from "@/components/settings/OrganizerTemplateRow";

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
  activeTabParam,
}: {
  workspaceId: string;
  basePath: string;
  tabs: TemplateTab[];
  heading: string;
  description: string;
  activeTabParam?: string;
}) {
  const activeTab: TemplateTabKey = tabs.some((t) => t.key === activeTabParam) ? (activeTabParam as TemplateTabKey) : tabs[0].key;

  const supabase = createClient();
  const orFilter = `workspace_id.is.null,workspace_id.eq.${workspaceId}`;
  const isOrganizers = activeTab === "organizers";
  const table = activeTab === "email" ? "email_templates" : activeTab === "sms" ? "sms_templates" : "engagement_letter_templates";

  const { data: templates } = isOrganizers
    ? { data: null }
    : await supabase.from(table).select("*").or(orFilter).order("name");

  const { data: organizerTemplates } = isOrganizers
    ? await supabase.from("organizer_templates").select("*").or(orFilter).order("name")
    : { data: null };

  const organizerTemplateIds = (organizerTemplates ?? []).map((t) => t.id);
  const { data: organizerFields } =
    isOrganizers && organizerTemplateIds.length > 0
      ? await supabase.from("organizer_fields").select("*").in("organizer_template_id", organizerTemplateIds)
      : { data: [] as { id: string; organizer_template_id: string; field_type: string; label: string; is_required: boolean; display_order: number; options: unknown }[] };

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
    <div className="max-w-3xl">
      <h2 className="text-base font-semibold text-ink">{heading}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>

      <div className="mt-4">{tabNav}</div>

      {isOrganizers ? (
        <>
          <p className="mt-2 text-sm text-muted">
            Organizers are the questionnaires clients complete in their portal. Click one to view or edit its questions.
          </p>
          <div className="mt-4">
            <CreateOrganizerTemplateForm workspaceId={workspaceId} />
          </div>
          <div className="mt-4">
            {(organizerTemplates ?? []).length === 0 ? (
              <EmptyState message="No organizers yet." />
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
                {(organizerTemplates ?? []).map((t) => (
                  <li key={t.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <OrganizerTemplateRow
                            template={t}
                            fields={(organizerFields ?? []).filter((f) => f.organizer_template_id === t.id) as never}
                          />
                          {!t.workspace_id && (
                            <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">System</span>
                          )}
                        </div>
                        <p className="text-xs text-muted">{t.slug}</p>
                      </div>
                      <TemplateStatusCycle table="organizer_templates" id={t.id} status={t.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mt-4">
            <CreateTemplateForm workspaceId={workspaceId} kind={activeTab === "engagement-letter" ? "engagement_letter" : activeTab} />
          </div>

          <div className="mt-4">
            {(templates ?? []).length === 0 ? (
              <EmptyState message="No templates yet." />
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
                            <TemplateEditRow
                              kind={activeTab === "engagement-letter" ? "engagement_letter" : activeTab}
                              template={t}
                            />
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
