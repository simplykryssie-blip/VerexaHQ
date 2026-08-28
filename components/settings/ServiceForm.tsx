"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";

const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";
const sectionClass = "rounded-2xl border border-border bg-surface p-4 shadow-soft";

export type Option = { id: string; name: string };

export type ServiceRow = {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  status: string;
  description: string | null;
  service_category_id: string | null;
  process_id: string | null;
  organizer_template_id: string | null;
  document_request_template_id: string | null;
  document_folder_template_id: string | null;
  engagement_letter_template_id: string | null;
  pricing_rule_id: string | null;
  billing_rule_id: string | null;
  default_price: number | null;
  estimated_duration_minutes: number | null;
  display_order: number;
  is_bookable: boolean;
  is_portal_visible: boolean;
  requires_organizer: boolean;
  requires_engagement_letter: boolean;
  requires_documents: boolean;
  requires_signature: boolean;
  requires_review: boolean;
  requires_invoice: boolean;
  requires_payment_before_release: boolean;
};

const REQUIREMENT_FIELDS: { key: keyof ServiceRow; label: string }[] = [
  { key: "requires_organizer", label: "Requires an organizer" },
  { key: "requires_engagement_letter", label: "Requires a signed document" },
  { key: "requires_documents", label: "Requires documents" },
  { key: "requires_signature", label: "Requires signature" },
  { key: "requires_review", label: "Requires review" },
  { key: "requires_invoice", label: "Requires an invoice" },
  { key: "requires_payment_before_release", label: "Requires payment before release" },
];

function OptionSelect({
  value,
  onChange,
  options,
  noneLabel,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  noneLabel: string;
  disabled?: boolean;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={inputClass}>
      <option value="">{noneLabel}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

export function ServiceForm({
  service,
  categories,
  pipelines,
  organizerTemplates,
  documentRequestTemplates,
  documentFolderTemplates,
  engagementLetterTemplates,
  pricingRules,
  billingRules,
  canManage,
}: {
  service: ServiceRow;
  categories: Option[];
  pipelines: Option[];
  organizerTemplates: Option[];
  documentRequestTemplates: Option[];
  documentFolderTemplates: Option[];
  engagementLetterTemplates: Option[];
  pricingRules: Option[];
  billingRules: Option[];
  canManage: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [categoryOptions, setCategoryOptions] = useState(categories);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const [name, setName] = useState(service.name);
  const [slug, setSlug] = useState(service.slug);
  const [description, setDescription] = useState(service.description ?? "");
  const [categoryId, setCategoryId] = useState(service.service_category_id ?? "");
  const [processId, setProcessId] = useState(service.process_id ?? "");
  const [organizerTemplateId, setOrganizerTemplateId] = useState(service.organizer_template_id ?? "");
  const [documentRequestTemplateId, setDocumentRequestTemplateId] = useState(service.document_request_template_id ?? "");
  const [documentFolderTemplateId, setDocumentFolderTemplateId] = useState(service.document_folder_template_id ?? "");
  const [engagementLetterTemplateId, setEngagementLetterTemplateId] = useState(service.engagement_letter_template_id ?? "");
  const [pricingRuleId, setPricingRuleId] = useState(service.pricing_rule_id ?? "");
  const [billingRuleId, setBillingRuleId] = useState(service.billing_rule_id ?? "");
  const [defaultPrice, setDefaultPrice] = useState(service.default_price != null ? String(service.default_price) : "");
  const [estimatedDuration, setEstimatedDuration] = useState(
    service.estimated_duration_minutes != null ? String(service.estimated_duration_minutes) : ""
  );
  const [displayOrder, setDisplayOrder] = useState(String(service.display_order));
  const [isBookable, setIsBookable] = useState(service.is_bookable);
  const [isPortalVisible, setIsPortalVisible] = useState(service.is_portal_visible);
  const [requirements, setRequirements] = useState(
    Object.fromEntries(REQUIREMENT_FIELDS.map((f) => [f.key, Boolean(service[f.key])])) as Record<string, boolean>
  );

  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Everything below defaults collapsed -- pricing/billing, document
  // templates, and the requirements checklist aren't part of the core
  // Service -> Pipeline -> Organizer flow a normal tax professional sets up
  // day to day, but stay reachable for firms that use them. Auto-opens if
  // any of them already has something set, so existing configuration isn't
  // hidden from whoever's looking at it.
  const hasAdvancedConfig = Boolean(
    documentRequestTemplateId ||
      documentFolderTemplateId ||
      engagementLetterTemplateId ||
      pricingRuleId ||
      billingRuleId ||
      defaultPrice ||
      estimatedDuration ||
      Object.values(requirements).some(Boolean)
  );
  const [showAdvanced, setShowAdvanced] = useState(hasAdvancedConfig);

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDirty(true);
    };
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    const slugified = trimmed
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const { data, error: insertError } = await supabase
      .from("service_categories")
      .insert({ workspace_id: service.workspace_id, name: trimmed, slug: slugified, display_order: categoryOptions.length })
      .select("id, name")
      .single();
    if (insertError || !data) {
      toast.show(insertError?.message ?? "Could not create category.", "error");
      return;
    }
    setCategoryOptions((prev) => [...prev, data]);
    setCategoryId(data.id);
    setDirty(true);
    setAddingCategory(false);
    setNewCategoryName("");
  }

  async function save() {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("services")
      .update({
        name: name.trim() || service.name,
        slug: slug.trim() || service.slug,
        description: description.trim() || null,
        service_category_id: categoryId || null,
        process_id: processId || null,
        organizer_template_id: organizerTemplateId || null,
        document_request_template_id: documentRequestTemplateId || null,
        document_folder_template_id: documentFolderTemplateId || null,
        engagement_letter_template_id: engagementLetterTemplateId || null,
        pricing_rule_id: pricingRuleId || null,
        billing_rule_id: billingRuleId || null,
        default_price: defaultPrice.trim() ? Number(defaultPrice) : null,
        estimated_duration_minutes: estimatedDuration.trim() ? Number(estimatedDuration) : null,
        display_order: Number(displayOrder) || 0,
        is_bookable: isBookable,
        is_portal_visible: isPortalVisible,
        ...requirements,
      })
      .eq("id", service.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDirty(false);
    toast.show("Saved", "success");
    router.refresh();
  }

  async function deleteService() {
    if (!window.confirm(`Delete "${service.name}"? This can't be undone.`)) return;
    const { error: deleteError } = await supabase.from("services").delete().eq("id", service.id);
    if (deleteError) {
      toast.show(deleteError.message, "error");
      return;
    }
    router.push("/settings/services");
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <TemplateStatusCycle table="services" id={service.id} status={service.status} />
        {!processId && <p className="text-xs font-medium text-warning">No pipeline set -- leads for this service won&apos;t move anywhere.</p>}
      </div>

      <div className={sectionClass}>
        <label className={labelClass}>
          Name
          <input value={name} onChange={(e) => markDirty(setName)(e.target.value)} disabled={!canManage} className={inputClass} />
        </label>
        <label className={`${labelClass} mt-3`}>
          Slug
          <input value={slug} onChange={(e) => markDirty(setSlug)(e.target.value)} disabled={!canManage} className={inputClass} />
        </label>
        <label className={`${labelClass} mt-3`}>
          Description
          <textarea
            value={description}
            onChange={(e) => markDirty(setDescription)(e.target.value)}
            disabled={!canManage}
            rows={3}
            className={inputClass}
          />
        </label>

        <div className={`${labelClass} mt-3`}>
          Category
          {addingCategory ? (
            <form onSubmit={addCategory} className="mt-1 flex items-center gap-1.5">
              <input
                autoFocus
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Category name"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm normal-case text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button type="submit" className="shrink-0 rounded-lg p-2 text-accent hover:bg-accentSoft" aria-label="Save category">
                <Check size={14} />
              </button>
              <button type="button" onClick={() => setAddingCategory(false)} className="shrink-0 rounded-lg p-2 text-muted hover:text-ink" aria-label="Cancel">
                <X size={14} />
              </button>
            </form>
          ) : (
            <div className="mt-1 flex items-center gap-1.5">
              <OptionSelect value={categoryId} onChange={markDirty(setCategoryId)} options={categoryOptions} noneLabel="No category" disabled={!canManage} />
              {canManage && (
                <button
                  type="button"
                  onClick={() => setAddingCategory(true)}
                  className="shrink-0 rounded-lg border border-dashed border-border p-2 text-muted hover:border-accent hover:text-accent"
                  aria-label="New category"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={sectionClass}>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink">Pipeline &amp; organizer</p>
        <p className="mt-1 text-[11px] text-muted">
          When a client selects this service, this is what routes them: the pipeline their engagement moves through, and the
          organizer they fill out.
        </p>
        <label className={`${labelClass} mt-3`}>
          Pipeline
          <OptionSelect value={processId} onChange={markDirty(setProcessId)} options={pipelines} noneLabel="No pipeline" disabled={!canManage} />
        </label>
        <label className={`${labelClass} mt-3`}>
          Organizer
          <OptionSelect
            value={organizerTemplateId}
            onChange={markDirty(setOrganizerTemplateId)}
            options={organizerTemplates}
            noneLabel="No organizer"
            disabled={!canManage}
          />
        </label>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-slate"
        >
          <ChevronDown size={12} className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
          Advanced -- document templates, pricing &amp; billing, requirements
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-4 rounded-xl border border-border bg-surfaceMuted p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink">Document templates</p>
              <label className={`${labelClass} mt-3`}>
                Document request template
                <OptionSelect
                  value={documentRequestTemplateId}
                  onChange={markDirty(setDocumentRequestTemplateId)}
                  options={documentRequestTemplates}
                  noneLabel="No document request template"
                  disabled={!canManage}
                />
              </label>
              <label className={`${labelClass} mt-3`}>
                Document folder template
                <OptionSelect
                  value={documentFolderTemplateId}
                  onChange={markDirty(setDocumentFolderTemplateId)}
                  options={documentFolderTemplates}
                  noneLabel="No document folder template"
                  disabled={!canManage}
                />
              </label>
              <label className={`${labelClass} mt-3`}>
                Signable document template
                <OptionSelect
                  value={engagementLetterTemplateId}
                  onChange={markDirty(setEngagementLetterTemplateId)}
                  options={engagementLetterTemplates}
                  noneLabel="No document template"
                  disabled={!canManage}
                />
              </label>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink">Pricing &amp; billing</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className={labelClass}>
                  Default price
                  <input
                    type="number"
                    step="0.01"
                    value={defaultPrice}
                    onChange={(e) => markDirty(setDefaultPrice)(e.target.value)}
                    disabled={!canManage}
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  Estimated duration (minutes)
                  <input
                    type="number"
                    value={estimatedDuration}
                    onChange={(e) => markDirty(setEstimatedDuration)(e.target.value)}
                    disabled={!canManage}
                    className={inputClass}
                  />
                </label>
              </div>
              <label className={`${labelClass} mt-3`}>
                Pricing rule
                <OptionSelect
                  value={pricingRuleId}
                  onChange={markDirty(setPricingRuleId)}
                  options={pricingRules}
                  noneLabel="No pricing rule"
                  disabled={!canManage}
                />
              </label>
              <label className={`${labelClass} mt-3`}>
                Billing rule
                <OptionSelect
                  value={billingRuleId}
                  onChange={markDirty(setBillingRuleId)}
                  options={billingRules}
                  noneLabel="No billing rule"
                  disabled={!canManage}
                />
              </label>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink">Requirements</p>
              <p className="mt-1 text-[11px] text-muted">
                Informational only for now -- nothing yet blocks an engagement on these. Longer-term home for this is a
                pipeline stage&apos;s own requirements, not a flat list here.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {REQUIREMENT_FIELDS.map((f) => (
                  <label key={f.key} className="flex items-center gap-2 text-sm text-slate">
                    <input
                      type="checkbox"
                      checked={requirements[f.key]}
                      onChange={(e) => markDirty(setRequirements)({ ...requirements, [f.key]: e.target.checked })}
                      disabled={!canManage}
                      className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={sectionClass}>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink">Visibility</p>
        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate">
            <input
              type="checkbox"
              checked={isBookable}
              onChange={(e) => markDirty(setIsBookable)(e.target.checked)}
              disabled={!canManage}
              className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
            />
            Bookable (clients can schedule an appointment for this service)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate">
            <input
              type="checkbox"
              checked={isPortalVisible}
              onChange={(e) => markDirty(setIsPortalVisible)(e.target.checked)}
              disabled={!canManage}
              className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
            />
            Visible in the public/portal service picker
          </label>
        </div>
        <label className={`${labelClass} mt-3 max-w-[10rem]`}>
          Display order
          <input
            type="number"
            value={displayOrder}
            onChange={(e) => markDirty(setDisplayOrder)(e.target.value)}
            disabled={!canManage}
            className={inputClass}
          />
        </label>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {canManage && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={deleteService}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-danger hover:border-danger"
          >
            <Trash2 size={13} /> Delete service
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
