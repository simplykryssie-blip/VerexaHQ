import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Workflow } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { CreatePricingRuleForm, CreateBillingRuleForm } from "@/components/settings/CreatePricingBillingRuleForms";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { PricingRuleEditRow, BillingRuleEditRow } from "@/components/settings/RuleEditRow";
import { ServiceGallery, type ServiceCard } from "@/components/settings/ServiceGallery";
import { DefaultServiceSettings } from "@/components/settings/DefaultServiceSettings";

export const dynamic = "force-dynamic";

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
        `id, name, slug, status, default_price, description, estimated_duration_minutes, is_bookable, is_portal_visible, workspace_id, service_categories(name),
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

  const { data: workspaceDefaults } = await supabase
    .from("workspaces")
    .select("default_individual_service_id, default_business_service_id")
    .eq("id", workspace.id)
    .single();

  const serviceCards: ServiceCard[] = (services ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    workspace_id: s.workspace_id,
    default_price: s.default_price,
    description: s.description,
    estimated_duration_minutes: s.estimated_duration_minutes,
    is_bookable: s.is_bookable,
    is_portal_visible: s.is_portal_visible,
    categoryName: (s.service_categories as unknown as { name?: string } | null)?.name ?? null,
    service_category_id: s.service_category_id,
    pricing_rule_id: s.pricing_rule_id,
    billing_rule_id: s.billing_rule_id,
    organizer_template_id: s.organizer_template_id,
    document_request_template_id: s.document_request_template_id,
    document_folder_template_id: s.document_folder_template_id,
    engagement_letter_template_id: s.engagement_letter_template_id,
  }));

  return (
    <div className="max-w-6xl">
      <SettingsSectionHeader
        icon={Workflow}
        title="Services"
        description="The offerings clients can be sold -- each ties together pricing, billing, organizer, document request, folder, and engagement letter templates for engagements created against it."
      />

      <DefaultServiceSettings
        workspaceId={workspace.id}
        services={(services ?? []).filter((s) => s.status === "published").map((s) => ({ id: s.id, name: s.name }))}
        defaultIndividualServiceId={workspaceDefaults?.default_individual_service_id ?? null}
        defaultBusinessServiceId={workspaceDefaults?.default_business_service_id ?? null}
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

      <div className="mt-8">
        <h3 className="text-sm font-semibold text-ink">Service packages</h3>
        <div className="mt-2">
          <ServiceGallery
            workspaceId={workspace.id}
            services={serviceCards}
            categories={categories ?? []}
            pricingRules={pricingRules ?? []}
            billingRules={billingRules ?? []}
            organizerTemplates={organizerTemplates ?? []}
            documentRequestTemplates={documentRequestTemplates ?? []}
            documentFolderTemplates={documentFolderTemplates ?? []}
            engagementLetterTemplates={engagementLetterTemplates ?? []}
          />
        </div>
      </div>
    </div>
  );
}
