import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { EmptyState } from "@/components/EmptyState";
import { CreateTemplateForm } from "@/components/settings/CreateTemplateForm";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "engagement-letter", label: "Engagement Letters" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function mergeFieldTokens(text: string) {
  const matches = text.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? [];
  return Array.from(new Set(matches));
}

export default async function TemplatesPage({ searchParams }: { searchParams: { tab?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  const activeTab: TabKey = TABS.some((t) => t.key === searchParams.tab) ? (searchParams.tab as TabKey) : "email";

  const supabase = createClient();
  const table = activeTab === "email" ? "email_templates" : activeTab === "sms" ? "sms_templates" : "engagement_letter_templates";
  const { data: templates } = await supabase
    .from(table)
    .select("*")
    .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
    .order("name");

  const tabNav = (
    <nav className="flex gap-1 border-b border-border">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/settings/templates?tab=${t.key}`}
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
      <h2 className="text-base font-semibold text-ink">Templates</h2>
      <p className="mt-1 text-sm text-muted">
        Email, SMS, and engagement letter templates. Use <code className="rounded bg-surfaceMuted px-1">{"{{merge_field}}"}</code> tokens -- they&apos;re
        substituted automatically when a message sends.
      </p>

      <div className="mt-4">{tabNav}</div>

      <div className="mt-4">
        <CreateTemplateForm workspaceId={workspace.id} kind={activeTab === "engagement-letter" ? "engagement_letter" : activeTab} />
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
                      <p className="text-sm font-medium text-ink">
                        {t.name} {!t.workspace_id && <span className="ml-1.5 rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">System</span>}
                      </p>
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
    </div>
  );
}
