import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Workflow } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { CreateServiceForm } from "@/components/settings/CreateServiceForm";
import { CreatePricingRuleForm, CreateBillingRuleForm } from "@/components/settings/CreatePricingBillingRuleForms";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { ServiceEditRow } from "@/components/settings/ServiceEditRow";
import { CloneServiceButton } from "@/components/settings/CloneServiceButton";
import { PricingRuleEditRow, BillingRuleEditRow } from "@/components/settings/RuleEditRow";

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
      .select(
        `id, name, slug, status, default_price, is_bookable, is_portal_visible, workspace_id, service_categories(name),
        service_category_id, pricing_rule_id, billing_rule_id, organizer_template_id, document_request_template_id,
        document_folder_template_id, engagement_letter_template_id`
      )
      .or(orFilter)
      .order("name"),
    supabase.from("service_categories").select("id, name").or(orFilter).order("name"),
    supabase.from("pricing_rules").select("id, name, status, pricing_method, base_amount, hourly_rate, workspace_id").or(orFilter).order("name"),
    supabase.from("billing_rules").select("id, name, status, invoice_timing, workspace_id").or(orFilter).order("name"),
    supabase.from("organizer_templates").select("id, name").or(orFilter).order("name"),
    supabase.from("document_request_templates").select("id, name").or(orFilter).order("name"),
    supabase.from("document_folder_templates").select("id, name").or(orFilter).order("name"),
    supabase.from("engagement_letter_templates").select("id, name").or(orFilter).order("name"),
  ]);

  return (
    <div className="max-w-3xl">
      <SettingsSectionHeader
        icon={Workflow}
        title="Workflow Setup"
        description="The offerings clients can be sold -- each ties together pricing, billing, organizer, document request, folder, and engagement letter templates for engagements created against it."
      />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">Pricing rules</h3>
          <div className="mt-2 space-y-2">
            {(pricingRules ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                <PricingRuleEditRow rule={r} />
                <TemplateStatusCycle table="pricing_rules" id={r.id} status={r.status} />
              </div>
            ))}
            <CreatePricingRuleForm workspaceId={workspace.id} />
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">Billing rules</h3>
          <div className="mt-2 space-y-2">
            {(billingRules ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                <BillingRuleEditRow rule={r} />
                <TemplateStatusCycle table="billing_rules" id={r.id} status={r.status} />
              </div>
            ))}
            <CreateBillingRuleForm workspaceId={workspace.id} />
          </div>
        </div>
      </div>

      <div className="mt-6">
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
          <EmptyState icon={Workflow} message="No service packages yet." />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {(services ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex-1">
                  <ServiceEditRow
                    service={s as never}
                    categories={categories ?? []}
                    pricingRules={pricingRules ?? []}
                    billingRules={billingRules ?? []}
                    organizerTemplates={organizerTemplates ?? []}
                    documentRequestTemplates={documentRequestTemplates ?? []}
                    documentFolderTemplates={documentFolderTemplates ?? []}
                    engagementLetterTemplates={engagementLetterTemplates ?? []}
                  />
                  <p className="text-xs text-muted">
                    {(s.service_categories as unknown as { name?: string } | null)?.name ?? "Uncategorized"} -- {money(s.default_price)}
                    {s.is_bookable && " -- Bookable"}
                    {s.is_portal_visible && " -- Portal visible"}
                  </p>
                  <div className="mt-1">
                    {s.workspace_id ? (
                      <Link href={`/settings/service-packages/${s.id}`} className="text-xs font-medium text-accent hover:underline">
                        Manage stages
                      </Link>
                    ) : (
                      <CloneServiceButton serviceId={s.id} workspaceId={workspace.id} />
                    )}
                  </div>
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
