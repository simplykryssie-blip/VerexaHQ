"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Workflow } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/Modal";
import { TemplateSelect } from "@/components/settings/TemplateSelect";
import { OrganizerServiceRouting } from "@/components/settings/OrganizerServiceRouting";

type Option = { id: string; name: string };
type PricingRuleOption = { id: string; name: string; pricing_method: string };

const VARIABLE_PRICING_METHODS = ["custom_quote", "tax_form_based", "complexity_based"];

type ServiceRow = {
  id: string;
  name: string;
  status: string;
  workspace_id: string | null;
  default_price: number | null;
  description: string | null;
  estimated_duration_minutes: number | null;
  is_bookable: boolean;
  is_portal_visible: boolean;
  service_category_id: string | null;
  pricing_rule_id: string | null;
  billing_rule_id: string | null;
  organizer_template_id: string | null;
  document_folder_template_id: string | null;
};

export function ServiceEditRow({
  service,
  workspaceId,
  categories,
  pricingRules,
  billingRules,
  organizerTemplates,
  documentFolderTemplates,
  onClose,
}: {
  service: ServiceRow;
  workspaceId: string;
  categories: Option[];
  pricingRules: PricingRuleOption[];
  billingRules: Option[];
  organizerTemplates: Option[];
  documentFolderTemplates: Option[];
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSystem = !service.workspace_id;

  const [name, setName] = useState(service.name);
  const [price, setPrice] = useState(service.default_price?.toString() ?? "");
  const [description, setDescription] = useState(service.description ?? "");
  const [durationMinutes, setDurationMinutes] = useState(service.estimated_duration_minutes?.toString() ?? "");
  const [isBookable, setIsBookable] = useState(service.is_bookable);
  const [isPortalVisible, setIsPortalVisible] = useState(service.is_portal_visible);
  const [categoryId, setCategoryId] = useState(service.service_category_id ?? "");
  const [pricingRuleId, setPricingRuleId] = useState(service.pricing_rule_id ?? "");
  const [billingRuleId, setBillingRuleId] = useState(service.billing_rule_id ?? "");
  const [organizerTemplateId, setOrganizerTemplateId] = useState(service.organizer_template_id ?? "");
  const [documentFolderTemplateId, setDocumentFolderTemplateId] = useState(service.document_folder_template_id ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const selectedPricingRule = pricingRules.find((r) => r.id === pricingRuleId);
  const isVariablePricing = Boolean(selectedPricingRule && VARIABLE_PRICING_METHODS.includes(selectedPricingRule.pricing_method));

  async function save() {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("services")
      .update({
        name,
        default_price: isVariablePricing ? null : price ? Number(price) : null,
        description: description.trim() || null,
        estimated_duration_minutes: durationMinutes ? Number(durationMinutes) : null,
        is_bookable: isBookable,
        is_portal_visible: isPortalVisible,
        service_category_id: categoryId || null,
        pricing_rule_id: pricingRuleId || null,
        billing_rule_id: billingRuleId || null,
        organizer_template_id: organizerTemplateId || null,
        document_folder_template_id: documentFolderTemplateId || null,
      })
      .eq("id", service.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal title={isSystem ? service.name : `Edit ${service.name}`} onClose={onClose} size="xl">
      {isSystem ? (
        <p className="text-sm text-muted">This is a system default and can&apos;t be edited here. Clone it to customize.</p>
      ) : (
        <div className="space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (shown to clients when booking)"
            rows={2}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <TemplateSelect value={categoryId} onChange={setCategoryId} options={categories} placeholder="Category" />
          <input
            type="number"
            min="5"
            step="5"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            placeholder="Duration in minutes (used for self-booking)"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate">
              <input type="checkbox" checked={isBookable} onChange={(e) => setIsBookable(e.target.checked)} className="h-4 w-4 rounded border-border" />
              Bookable
            </label>
            <label className="flex items-center gap-2 text-sm text-slate">
              <input
                type="checkbox"
                checked={isPortalVisible}
                onChange={(e) => setIsPortalVisible(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Portal visible
            </label>
          </div>

          <Link
            href={`/service-packages/${service.id}`}
            className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            <Workflow size={14} /> Manage pipeline
          </Link>

          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="mt-3 flex w-full items-center justify-between text-xs font-medium text-muted hover:text-ink"
          >
            Pricing, billing &amp; routing
            <ChevronDown size={14} className={`transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
          </button>
          {advancedOpen && (
            <div className="space-y-2 rounded-lg border border-border bg-surfaceMuted p-3">
              <div className="grid grid-cols-2 gap-2">
                <TemplateSelect value={pricingRuleId} onChange={setPricingRuleId} options={pricingRules} placeholder="Pricing rule" />
                <TemplateSelect value={billingRuleId} onChange={setBillingRuleId} options={billingRules} placeholder="Billing rule" />
              </div>
              {isVariablePricing ? (
                <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
                  &quot;{selectedPricingRule?.name}&quot; is a variable pricing method -- no default price is set here. The quote gets worked out
                  per engagement instead.
                </p>
              ) : (
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Default price"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              )}
              <TemplateSelect
                value={documentFolderTemplateId}
                onChange={setDocumentFolderTemplateId}
                options={documentFolderTemplates}
                placeholder="Document folder template"
              />
              {documentFolderTemplateId && (
                <Link href={`/service-packages/${service.id}`} className="inline-block text-xs font-medium text-accent hover:underline">
                  Manage folders
                </Link>
              )}
              <TemplateSelect value={organizerTemplateId} onChange={setOrganizerTemplateId} options={organizerTemplates} placeholder="Organizer template" />
              <p className="text-xs text-muted">
                This is which service an incoming organizer submission auto-attaches to -- not which form gets sent to a client. Attach a form to
                send from the pipeline stage that needs it instead.
              </p>
              {organizerTemplateId && <OrganizerServiceRouting workspaceId={workspaceId} organizerTemplateId={organizerTemplateId} />}
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
