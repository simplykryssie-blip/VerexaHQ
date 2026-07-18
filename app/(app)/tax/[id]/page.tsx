"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { TaxReturn, TaxEstimate, Client } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import TaxReturnModal from "@/components/TaxReturnModal";
import TaxEstimateModal from "@/components/TaxEstimateModal";

export default function TaxReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [taxReturn, setTaxReturn] = useState<TaxReturn | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [estimates, setEstimates] = useState<TaxEstimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showEstimateModal, setShowEstimateModal] = useState(false);
  const [editingEstimate, setEditingEstimate] = useState<TaxEstimate | null>(null);

  async function load() {
    setLoading(true);
    const { data: returnData, error: returnError } = await supabase
      .from("tax_returns")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (returnError || !returnData) {
      setError(returnError?.message ?? "Return not found.");
      setLoading(false);
      return;
    }

    const tr = returnData as TaxReturn;
    setTaxReturn(tr);

    const [clientRes, estimatesRes] = await Promise.all([
      supabase.from("clients").select("*").eq("id", tr.client_id).maybeSingle(),
      supabase
        .from("tax_estimates")
        .select("*")
        .eq("tax_return_id", tr.id)
        .order("quarter"),
    ]);

    setClient((clientRes.data as Client) ?? null);
    setEstimates((estimatesRes.data as TaxEstimate[]) ?? []);
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  if (loading) {
    return <div className="text-sm text-muted">Loading return…</div>;
  }

  if (error || !taxReturn) {
    return (
      <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3">
        {error ?? "Return not found."}
      </div>
    );
  }

  const clientName = client
    ? client.client_type === "business" && client.business_name
      ? client.business_name
      : `${client.first_name} ${client.last_name}`.trim()
    : "—";

  return (
    <div>
      <button
        onClick={() => router.push("/tax")}
        className="flex items-center gap-1.5 text-xs text-muted mb-4 hover:text-ink"
      >
        <ArrowLeft size={13} /> Back to Tax Prep
      </button>

      <div className="flex items-center gap-3 mb-6">
        <h1 className="font-slab text-2xl font-bold text-ink">
          {clientName} — {taxReturn.tax_year} {taxReturn.return_type}
        </h1>
        <StatusPill status={taxReturn.return_status.replaceAll("_", " ")} />
        <button
          onClick={() => setShowEditModal(true)}
          className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
        >
          <Pencil size={13} /> Edit
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Filing Status
          </div>
          <div className="text-sm text-ink">{taxReturn.filing_status || "—"}</div>
        </div>
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Federal Refund
          </div>
          <div className="text-sm font-mono tabular-nums text-green">
            {taxReturn.federal_refund_amount
              ? `$${taxReturn.federal_refund_amount.toLocaleString()}`
              : "—"}
          </div>
        </div>
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Federal Balance Due
          </div>
          <div className="text-sm font-mono tabular-nums text-brick">
            {taxReturn.federal_balance_due
              ? `$${taxReturn.federal_balance_due.toLocaleString()}`
              : "—"}
          </div>
        </div>
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Extension Filed
          </div>
          <div className="text-sm text-ink">{taxReturn.extension_filed ? "Yes" : "No"}</div>
        </div>
      </div>

      {taxReturn.notes && (
        <div className="bg-white border border-line rounded-sm p-4 mb-8">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Notes
          </div>
          <div className="text-sm text-ink whitespace-pre-wrap">{taxReturn.notes}</div>
        </div>
      )}

      <section>
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <h2 className="font-slab text-lg font-bold text-ink">Quarterly Estimates</h2>
          <button
            onClick={() => setShowEstimateModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            <Plus size={13} /> Add
          </button>
        </div>
        <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
          {estimates.length === 0 && (
            <div className="px-5 py-5 text-sm text-muted">
              No quarterly estimates tracked for this return.
            </div>
          )}
          {estimates.map((e) => (
            <button
              key={e.id}
              onClick={() => setEditingEstimate(e)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-paper transition-colors"
            >
              <div>
                <div className="font-semibold text-ink text-sm">{e.quarter}</div>
                <div className="text-xs text-muted mt-0.5">
                  Due {e.due_date ?? "—"}
                  {e.estimated_amount ? ` · $${e.estimated_amount.toLocaleString()}` : ""}
                </div>
              </div>
              <StatusPill status={e.payment_status} />
            </button>
          ))}
        </div>
      </section>

      {showEditModal && (
        <TaxReturnModal
          taxReturn={taxReturn}
          onClose={() => setShowEditModal(false)}
          onSaved={load}
          onDeleted={() => router.push("/tax")}
        />
      )}
      {showEstimateModal && client && (
        <TaxEstimateModal
          clientId={client.id}
          taxYear={taxReturn.tax_year}
          taxReturnId={taxReturn.id}
          onClose={() => setShowEstimateModal(false)}
          onSaved={load}
        />
      )}
      {editingEstimate && client && (
        <TaxEstimateModal
          clientId={client.id}
          taxYear={taxReturn.tax_year}
          taxReturnId={taxReturn.id}
          estimate={editingEstimate}
          onClose={() => setEditingEstimate(null)}
          onSaved={load}
          onDeleted={load}
        />
      )}
    </div>
  );
}
