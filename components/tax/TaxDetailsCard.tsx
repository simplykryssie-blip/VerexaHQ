"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export type TaxDetailRow = {
  tax_year: number | null;
  return_type: string | null;
  is_amended: boolean;
  is_extended: boolean;
  extension_filed_date: string | null;
  extension_due_date: string | null;
  efile_status: string;
  efile_transmitted_at: string | null;
  efile_accepted_at: string | null;
  efile_rejected_reason: string | null;
  updated_at?: string;
} | null;

const EFILE_STATUSES = ["not_filed", "ready_to_file", "transmitted", "accepted", "rejected", "paper_filed"] as const;

// Most common first -- solo/individual returns dominate this practice's
// volume, per the product's own stated tier priorities.
const RETURN_TYPES = [
  { value: "1040", label: "1040 -- Individual" },
  { value: "1040-NR", label: "1040-NR -- Nonresident individual" },
  { value: "1120-S", label: "1120-S -- S Corporation" },
  { value: "1065", label: "1065 -- Partnership" },
  { value: "1120", label: "1120 -- C Corporation" },
  { value: "990", label: "990 -- Nonprofit / Exempt Organization" },
  { value: "1041", label: "1041 -- Estates & Trusts" },
  { value: "941", label: "941 -- Employer's Quarterly Federal Tax Return" },
  { value: "940", label: "940 -- Employer's Annual FUTA" },
  { value: "709", label: "709 -- Gift Tax" },
  { value: "706", label: "706 -- Estate Tax" },
] as const;

export function TaxDetailsCard({
  engagementId,
  workspaceId,
  detail,
  taxYears,
}: {
  engagementId: string;
  workspaceId: string;
  detail: TaxDetailRow;
  taxYears: number[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const yearOptions = detail?.tax_year && !taxYears.includes(detail.tax_year) ? [detail.tax_year, ...taxYears] : taxYears;
  const [taxYear, setTaxYear] = useState(detail?.tax_year?.toString() ?? "");
  const [returnType, setReturnType] = useState(detail?.return_type ?? "");
  const [isAmended, setIsAmended] = useState(detail?.is_amended ?? false);
  const [isExtended, setIsExtended] = useState(detail?.is_extended ?? false);
  const [extensionDueDate, setExtensionDueDate] = useState(detail?.extension_due_date ?? "");
  const [efileStatus, setEfileStatus] = useState(detail?.efile_status ?? "not_filed");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setTaxYear(detail?.tax_year?.toString() ?? "");
    setReturnType(detail?.return_type ?? "");
    setIsAmended(detail?.is_amended ?? false);
    setIsExtended(detail?.is_extended ?? false);
    setExtensionDueDate(detail?.extension_due_date ?? "");
    setEfileStatus(detail?.efile_status ?? "not_filed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.updated_at]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    const { error } = await supabase.from("engagement_tax_details").upsert(
      {
        engagement_id: engagementId,
        workspace_id: workspaceId,
        tax_year: taxYear ? parseInt(taxYear, 10) : null,
        return_type: returnType || null,
        is_amended: isAmended,
        is_extended: isExtended,
        extension_due_date: isExtended ? extensionDueDate || null : null,
        efile_status: efileStatus,
        ...(efileStatus === "transmitted" && detail?.efile_status !== "transmitted" ? { efile_transmitted_at: new Date().toISOString() } : {}),
        ...(efileStatus === "accepted" && detail?.efile_status !== "accepted" ? { efile_accepted_at: new Date().toISOString() } : {}),
      },
      { onConflict: "engagement_id" }
    );
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      toast.show(error.message, "error");
      return;
    }
    setSaved(true);
    toast.show("Tax details saved", "success");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">Tax details</h3>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="tax_year" className="block text-xs font-medium text-muted">
            Tax year
          </label>
          <select
            id="tax_year"
            value={taxYear}
            onChange={(e) => setTaxYear(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Not set</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="return_type" className="block text-xs font-medium text-muted">
            Return type
          </label>
          <select
            id="return_type"
            value={returnType}
            onChange={(e) => setReturnType(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Not set</option>
            {RETURN_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="efile_status" className="block text-xs font-medium text-muted">
            E-file status
          </label>
          <select
            id="efile_status"
            value={efileStatus}
            onChange={(e) => setEfileStatus(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm capitalize focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {EFILE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col justify-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate">
            <input type="checkbox" checked={isAmended} onChange={(e) => setIsAmended(e.target.checked)} className="h-4 w-4 rounded border-border" />
            Amended return
          </label>
          <label className="flex items-center gap-2 text-sm text-slate">
            <input type="checkbox" checked={isExtended} onChange={(e) => setIsExtended(e.target.checked)} className="h-4 w-4 rounded border-border" />
            Extension filed
          </label>
        </div>
        {isExtended && (
          <div>
            <label htmlFor="extension_due_date" className="block text-xs font-medium text-muted">
              Extended due date
            </label>
            <input
              id="extension_due_date"
              type="date"
              value={extensionDueDate}
              onChange={(e) => setExtensionDueDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save tax details"}
        </button>
        {saved && !saveError && <span className="text-sm text-success">Saved.</span>}
        {saveError && <span className="text-sm text-danger">{saveError}</span>}
      </div>
    </div>
  );
}
