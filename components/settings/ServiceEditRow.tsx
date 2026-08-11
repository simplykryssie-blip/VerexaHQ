"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/Modal";

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
  document_request_template_id: string | null;
  document_folder_template_id: string | null;
  engagement_letter_template_id: string | null;
};

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

export function ServiceEditRow({
  service,
  categories,
  pricingRules,
  billingRules,
  organizerTemplates,
  documentRequestTemplates,
  documentFolderTemplates,
  engagementLetterTemplates,
  onClose,
}: {
  service: ServiceRow;
  categories: Option[];
  pricingRules: PricingRuleOption[];
  billingRules: Option[];
  organizerTemplates: Option[];
  documentRequestTemplates: Option[];
  documentFolderTemplates: Option[];
  engagementLetterTemplates: Option[];
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
  const [documentRequestTemplateId, setDocumentRequestTemplateId] = useState(service.document_request_template_id ?? "");
  const [documentFolderTemplateId, setDocumentFolderTemplateId] = useState(service.document_folder_template_id ?? "");
  const [engagementLetterTemplateId, setEngagementLetterTemplateId] = useState(service.engagement_letter_template_id ?? "");

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
        document_request_template_id: documentRequestTemplateId || null,
        document_folder_template_id: documentFolderTemplateId || null,
        engagement_letter_template_id: engagementLetterTemplateId || null,
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
          <Select value={categoryId} onChange={setCategoryId} options={categories} placeholder="Category" />
          <div className="grid grid-cols-2 gap-2">
            <Select value={pricingRuleId} onChange={setPricingRuleId} options={pricingRules} placeholder="Pricing rule" />
            <Select value={billingRuleId} onChange={setBillingRuleId} options={billingRules} placeholder="Billing rule" />
          </div>
          {isVariablePricing ? (
            <p className="rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-xs text-muted">
              &quot;{selectedPricingRule?.name}&quot; is a variable pricing method -- no default price is set here. The quote gets worked out per
              engagement instead.
            </p>
          ) : (
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Default price"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          )}
          <input
            type="number"
            min="5"
            step="5"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            placeholder="Duration in minutes (used for self-booking)"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <Select value={organizerTemplateId} onChange={setOrganizerTemplateId} options={organizerTemplates} placeholder="Organizer template" />
          <Select
            value={documentRequestTemplateId}
            onChange={setDocumentRequestTemplateId}
            options={documentRequestTemplates}
            placeholder="Document request template"
          />
          <div>
            <Select
              value={documentFolderTemplateId}
              onChange={setDocumentFolderTemplateId}
              options={documentFolderTemplates}
              placeholder="Document folder template"
            />
            {documentFolderTemplateId && (
              <Link href={`/service-packages/${service.id}`} className="mt-1 inline-block text-xs font-medium text-accent hover:underline">
                Manage folders
              </Link>
            )}
          </div>
          <Select
            value={engagementLetterTemplateId}
            onChange={setEngagementLetterTemplateId}
            options={engagementLetterTemplates}
            placeholder="Engagement letter template"
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
