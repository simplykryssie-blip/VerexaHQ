"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { generateIrsAuthorizationDocument } from "@/lib/documents/generateIrsAuthorizationDocument";
import type { IrsTaxMatterRow } from "@/lib/irsAuthorization/types";
import type { Irs8821OrganizerPrefill } from "@/lib/organizerPrefill8821";

const TAX_INFO_TYPE_OPTIONS = ["Income", "Employment", "Payroll", "Excise", "Estate/Gift", "Civil Penalty"];

function emptyRow(): IrsTaxMatterRow {
  return { tax_info_type: "", tax_form_number: "", years_or_periods: "", specific_matters: "" };
}

export function NewIrsAuthorizationForm({
  workspaceId,
  clientId,
  clientName,
  clientEmail,
  clientAddress,
  defaultTaxpayerType,
  engagements,
  staffOptions,
  templates,
  firmName,
  firmAddress,
  firmPhone,
  organizerPrefill,
  currentUserId,
}: {
  workspaceId: string;
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  clientAddress: string;
  defaultTaxpayerType: "individual" | "business";
  engagements: { id: string; label: string; taxYear: number | null }[];
  staffOptions: { id: string; name: string; cafNumber: string | null }[];
  templates: { id: string; name: string }[];
  firmName: string;
  firmAddress: string;
  firmPhone: string;
  organizerPrefill: Irs8821OrganizerPrefill;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [taxpayerType, setTaxpayerType] = useState<"individual" | "business">(defaultTaxpayerType);
  const [engagementId, setEngagementId] = useState(engagements[0]?.id ?? "");
  const [designeeUserId, setDesigneeUserId] = useState(
    (currentUserId && staffOptions.some((s) => s.id === currentUserId) ? currentUserId : staffOptions[0]?.id) ?? ""
  );
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [taxMatters, setTaxMatters] = useState<IrsTaxMatterRow[]>(() => {
    const first = emptyRow();
    const engagementYear = engagements[0]?.taxYear;
    if (engagementYear) first.years_or_periods = String(engagementYear);
    if (organizerPrefill.taxYearsPeriods) first.years_or_periods = organizerPrefill.taxYearsPeriods;
    if (organizerPrefill.specificTaxMatters) first.specific_matters = organizerPrefill.specificTaxMatters;
    return [first];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(index: number, patch: Partial<IrsTaxMatterRow>) {
    setTaxMatters((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!designeeUserId) {
      setError("Choose a designee.");
      return;
    }
    if (!templateId) {
      setError("Choose the uploaded IRS Form 8821 PDF template.");
      return;
    }
    const cleanedMatters = taxMatters.filter((r) => r.tax_info_type || r.tax_form_number || r.years_or_periods || r.specific_matters);
    if (cleanedMatters.length === 0) {
      setError("Add at least one tax matter row.");
      return;
    }

    setSaving(true);
    const { data: authorizationId, error: createError } = await supabase.rpc("create_irs_authorization", {
      p_workspace_id: workspaceId,
      p_client_id: clientId,
      p_engagement_id: (engagementId || null) as never,
      p_taxpayer_type: taxpayerType,
      p_designee_user_id: designeeUserId,
      p_tax_matters: cleanedMatters as never,
    });
    if (createError || !authorizationId) {
      setSaving(false);
      setError(createError?.message ?? "Could not create the authorization.");
      return;
    }

    const designee = staffOptions.find((s) => s.id === designeeUserId);
    const result = await generateIrsAuthorizationDocument({
      supabase,
      workspaceId,
      clientId,
      clientName,
      clientEmail,
      clientAddress,
      firmName,
      firmAddress,
      firmPhone,
      templateId,
      designeeName: designee?.name ?? "",
      designeeCafNumber: designee?.cafNumber ?? null,
      taxMatters: cleanedMatters,
    });
    if ("error" in result) {
      setSaving(false);
      toast.show(`Authorization created, but the PDF couldn't be generated yet: ${result.error}`, "error");
      router.push(`/irs-authorizations/${authorizationId}`);
      return;
    }

    await supabase
      .from("irs_authorizations")
      .update({
        attachment_id: result.attachmentId,
        signature_request_id: result.signatureRequestId,
        status: "awaiting_identity_verification",
      })
      .eq("id", authorizationId);

    setSaving(false);
    toast.show("IRS authorization created and document generated", "success");
    router.push(`/irs-authorizations/${authorizationId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <p className="text-sm font-medium text-slate">Client</p>
        <p className="text-sm text-ink">{clientName}</p>
      </div>

      <label className="block text-sm font-medium text-slate">
        Taxpayer type
        <select
          value={taxpayerType}
          onChange={(e) => setTaxpayerType(e.target.value as "individual" | "business")}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="individual">Individual</option>
          <option value="business">Business</option>
        </select>
      </label>

      {engagements.length > 0 && (
        <label className="block text-sm font-medium text-slate">
          Linked engagement (optional)
          <select
            value={engagementId}
            onChange={(e) => setEngagementId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">None</option>
            {engagements.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
                {e.taxYear ? ` (${e.taxYear})` : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block text-sm font-medium text-slate">
        Designee
        <select
          value={designeeUserId}
          onChange={(e) => setDesigneeUserId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {staffOptions.length === 0 && <option value="">No staff found</option>}
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.cafNumber ? ` (CAF ${s.cafNumber})` : ""}
            </option>
          ))}
        </select>
        {designeeUserId && !staffOptions.find((s) => s.id === designeeUserId)?.cafNumber && (
          <span className="mt-1 block text-xs text-warning">
            This designee has no CAF number on file yet -- add it in Settings &gt; Profile before sending this for signature.
          </span>
        )}
      </label>

      <label className="block text-sm font-medium text-slate">
        IRS Form 8821 PDF template
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {templates.length === 0 && <option value="">No PDF templates uploaded yet</option>}
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {templates.length === 0 && (
          <span className="mt-1 block text-xs text-muted">
            Upload the real IRS Form 8821 PDF and map its fields under Templates &gt; Form Templates first.
          </span>
        )}
      </label>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate">Tax matters</p>
          <button
            type="button"
            onClick={() => setTaxMatters((prev) => [...prev, emptyRow()])}
            className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            <Plus size={13} /> Add row
          </button>
        </div>
        <div className="mt-2 space-y-3">
          {taxMatters.map((row, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 rounded-xl border border-border p-3 sm:grid-cols-2">
              <label className="text-xs text-muted">
                Type of tax information
                <select
                  value={row.tax_info_type}
                  onChange={(e) => updateRow(i, { tax_info_type: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">Choose one</option>
                  {TAX_INFO_TYPE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted">
                Tax form number
                <input
                  value={row.tax_form_number}
                  onChange={(e) => updateRow(i, { tax_form_number: e.target.value })}
                  placeholder="e.g. 1040"
                  className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </label>
              <label className="text-xs text-muted">
                Year(s) or period(s)
                <input
                  value={row.years_or_periods}
                  onChange={(e) => updateRow(i, { years_or_periods: e.target.value })}
                  placeholder="e.g. 2023, 2024"
                  className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </label>
              <label className="text-xs text-muted">
                Specific tax matters (optional)
                <input
                  value={row.specific_matters}
                  onChange={(e) => updateRow(i, { specific_matters: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </label>
              {taxMatters.length > 1 && (
                <button
                  type="button"
                  onClick={() => setTaxMatters((prev) => prev.filter((_, idx) => idx !== i))}
                  className="col-span-full inline-flex w-fit items-center gap-1 text-xs font-medium text-danger hover:underline"
                >
                  <Trash2 size={12} /> Remove row
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {saving ? "Creating..." : "Create & generate document"}
        </button>
      </div>
    </form>
  );
}
