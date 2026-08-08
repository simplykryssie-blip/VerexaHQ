"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Option = { id: string; name: string };

type ServiceRow = {
  id: string;
  name: string;
  status: string;
  workspace_id: string | null;
  default_price: number | null;
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
}: {
  service: ServiceRow;
  categories: Option[];
  pricingRules: Option[];
  billingRules: Option[];
  organizerTemplates: Option[];
  documentRequestTemplates: Option[];
  documentFolderTemplates: Option[];
  engagementLetterTemplates: Option[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSystem = !service.workspace_id;

  const [name, setName] = useState(service.name);
  const [price, setPrice] = useState(service.default_price?.toString() ?? "");
  const [isBookable, setIsBookable] = useState(service.is_bookable);
  const [isPortalVisible, setIsPortalVisible] = useState(service.is_portal_visible);
  const [categoryId, setCategoryId] = useState(service.service_category_id ?? "");
  const [pricingRuleId, setPricingRuleId] = useState(service.pricing_rule_id ?? "");
  const [billingRuleId, setBillingRuleId] = useState(service.billing_rule_id ?? "");
  const [organizerTemplateId, setOrganizerTemplateId] = useState(service.organizer_template_id ?? "");
  const [documentRequestTemplateId, setDocumentRequestTemplateId] = useState(service.document_request_template_id ?? "");
  const [documentFolderTemplateId, setDocumentFolderTemplateId] = useState(service.document_folder_template_id ?? "");
  const [engagementLetterTemplateId, setEngagementLetterTemplateId] = useState(service.engagement_letter_template_id ?? "");

  async function save() {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("services")
      .update({
        name,
        default_price: price ? Number(price) : null,
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
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex-1">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-left text-sm font-medium text-ink hover:text-accent hover:underline">
        {service.name}
      </button>

      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-border bg-surfaceMuted p-3">
          {isSystem ? (
            <p className="text-xs text-muted">This is a system default and can&apos;t be edited here.</p>
          ) : (
            <>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <div className="grid grid-cols-2 gap-2">
                <Select value={categoryId} onChange={setCategoryId} options={categories} placeholder="Category" />
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Default price"
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select value={pricingRuleId} onChange={setPricingRuleId} options={pricingRules} placeholder="Pricing rule" />
                <Select value={billingRuleId} onChange={setBillingRuleId} options={billingRules} placeholder="Billing rule" />
              </div>
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
                  <Link href={`/settings/service-packages/${service.id}`} className="mt-1 inline-block text-xs font-medium text-accent hover:underline">
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
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surface">
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
