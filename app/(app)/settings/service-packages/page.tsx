import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { EmptyState } from "@/components/EmptyState";
import { CreateServiceForm } from "@/components/settings/CreateServiceForm";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";

export const dynamic = "force-dynamic";

function money(n: number | null) {
  if (n === null) return "--";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function ServicePackagesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const orFilter = `workspace_id.is.null,workspace_id.eq.${workspace.id}`;

  const [
    { data: services },
    { data: categories },
    { data: pricingRules },
    { data: billingRules },
    { data: organizerTemplates },
    { data: documentRequestTemplates },
    { data: documentFolderTemplates },
    { data: engagementLetterTemplates },
  ] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, slug, status, default_price, is_bookable, is_portal_visible, service_categories(name)")
      .or(orFilter)
      .order("name"),
    supabase.from("service_categories").select("id, name").or(orFilter).order("name"),
    supabase.from("pricing_rules").select("id, name").or(orFilter).order("name"),
    supabase.from("billing_rules").select("id, name").or(orFilter).order("name"),
    supabase.from("organizer_templates").select("id, name").or(orFilter).order("name"),
    supabase.from("document_request_templates").select("id, name").or(orFilter).order("name"),
    supabase.from("document_folder_templates").select("id, name").or(orFilter).order("name"),
    supabase.from("engagement_letter_templates").select("id, name").or(orFilter).order("name"),
  ]);

  return (
    <div className="max-w-3xl">
      <h2 className="text-base font-semibold text-ink">Service Packages</h2>
      <p className="mt-1 text-sm text-muted">
        The offerings clients can be sold -- each ties together pricing, billing, organizer, document request, folder, and
        engagement letter templates for engagements created against it.
      </p>

      <div className="mt-4">
        <CreateServiceForm
          workspaceId={workspace.id}
          categories={categories ?? []}
          pricingRules={pricingRules ?? []}
          billingRules={billingRules ?? []}
          organizerTemplates={organizerTemplates ?? []}
          documentRequestTemplates={documentRequestTemplates ?? []}
          documentFolderTemplates={documentFolderTemplates ?? []}
          engagementLetterTemplates={engagementLetterTemplates ?? []}
        />
      </div>

      <div className="mt-4">
        {(services ?? []).length === 0 ? (
          <EmptyState message="No service packages yet." />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {(services ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{s.name}</p>
                  <p className="text-xs text-muted">
                    {(s.service_categories as unknown as { name?: string } | null)?.name ?? "Uncategorized"} -- {money(s.default_price)}
                    {s.is_bookable && " -- Bookable"}
                    {s.is_portal_visible && " -- Portal visible"}
                  </p>
                </div>
                <TemplateStatusCycle table="services" id={s.id} status={s.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
