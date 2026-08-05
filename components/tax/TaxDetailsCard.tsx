"use client";

import { useState } from "react";
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
} | null;

const EFILE_STATUSES = ["not_filed", "ready_to_file", "transmitted", "accepted", "rejected", "paper_filed"] as const;

export function TaxDetailsCard({
  engagementId,
  workspaceId,
  detail,
}: {
  engagementId: string;
  workspaceId: string;
  detail: TaxDetailRow;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [taxYear, setTaxYear] = useState(detail?.tax_year?.toString() ?? "");
  const [returnType, setReturnType] = useState(detail?.return_type ?? "");
  const [isAmended, setIsAmended] = useState(detail?.is_amended ?? false);
  const [isExtended, setIsExtended] = useState(detail?.is_extended ?? false);
  const [extensionDueDate, setExtensionDueDate] = useState(detail?.extension_due_date ?? "");
  const [efileStatus, setEfileStatus] = useState(detail?.efile_status ?? "not_filed");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
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
      toast.show(error.message, "error");
      return;
    }
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
          <input
            id="tax_year"
            type="number"
            value={taxYear}
            onChange={(e) => setTaxYear(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label htmlFor="return_type" className="block text-xs font-medium text-muted">
            Return type
          </label>
          <input
            id="return_type"
            value={returnType}
            onChange={(e) => setReturnType(e.target.value)}
            placeholder="1040, 1120, 1065..."
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
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
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save tax details"}
      </button>
    </div>
  );
}
