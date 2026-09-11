"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/Badge";

const inputClass = "mt-1 w-full max-w-xs rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";
const cardClass = "rounded-2xl border border-border bg-surface p-4 shadow-soft";

type FirmInfo = { phone: string | null; primaryContactEmail: string | null; website: string | null; mailingAddress: string | null };
type PackageOption = { id: string; name: string };
type PartnerOption = { id: string; name: string };
type Payout = {
  id: string;
  period_start: string;
  period_end: string;
  gross_prep_fees: number;
  gross_bank_product_rebates: number;
  gross_bank_fees: number;
  gross_addon_fees: number;
  gross_transmission_fees: number;
  gross_paperwork_fees: number;
  ero_share_amount: number;
  amount_owed_to_ptin: number;
  status: string;
  paid_at: string | null;
};

function money(n: number | null | undefined) {
  return `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PackagePicker({ connectionId, packageId, packages }: { connectionId: string; packageId: string | null; packages: PackageOption[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function change(value: string) {
    setSaving(true);
    const { error } = await supabase.from("firm_connections").update({ package_id: value || null }).eq("id", connectionId);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <label className={labelClass}>
      Package
      <select defaultValue={packageId ?? ""} onChange={(e) => change(e.target.value)} disabled={saving} className={inputClass}>
        <option value="">No package assigned</option>
        {packages.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

// Fees a preparer/ERO collects outside the base prep fee -- bank fee,
// add-on fee, transmission fee, paperwork fee. Purely informational (they
// don't affect the revenue-share split, which is prep fees + bank product
// rebates only) and only shown when a firm actually has one recorded --
// not every ERO offers bank products or charges these at all.
const OTHER_FEE_FIELDS: [string, string][] = [
  ["gross_bank_fees", "Bank fees"],
  ["gross_addon_fees", "Add-on fees"],
  ["gross_transmission_fees", "Transmission fees"],
  ["gross_paperwork_fees", "Paperwork fees"],
];

function BankPicker({ connectionId, bankPartnerId, banks }: { connectionId: string; bankPartnerId: string | null; banks: PartnerOption[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function change(value: string) {
    setSaving(true);
    const { error } = await supabase.from("firm_connections").update({ bank_partner_id: value || null }).eq("id", connectionId);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <label className={labelClass}>
      Bank
      <select defaultValue={bankPartnerId ?? ""} onChange={(e) => change(e.target.value)} disabled={saving} className={inputClass}>
        <option value="">No bank assigned</option>
        {banks.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SoftwarePicker({
  connectionId,
  softwarePartnerId,
  softwareList,
}: {
  connectionId: string;
  softwarePartnerId: string | null;
  softwareList: PartnerOption[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function change(value: string) {
    setSaving(true);
    const { error } = await supabase.from("firm_connections").update({ software_partner_id: value || null }).eq("id", connectionId);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <label className={labelClass}>
      Software
      <select defaultValue={softwarePartnerId ?? ""} onChange={(e) => change(e.target.value)} disabled={saving} className={inputClass}>
        <option value="">No software assigned</option>
        {softwareList.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProductionStats({ production }: { production: Record<string, unknown> | null }) {
  if (!production) {
    return <p className="text-sm text-muted">Production data isn&apos;t available until the connection is active.</p>;
  }
  const engagementsByStatus = (production.engagements_by_status as Record<string, number>) ?? {};
  const bankProducts = (production.bank_products as { product_type: string; bank_partner: string; count: number; total_rebate: number }[]) ?? [];
  const otherFees = OTHER_FEE_FIELDS.filter(([key]) => Number(production[key] ?? 0) > 0);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className={cardClass}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">This period</p>
        <p className="mt-1 text-xs text-muted">
          {String(production.period_start)} - {String(production.period_end)}
        </p>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Active clients</dt>
            <dd className="font-medium text-slate">{String(production.active_clients ?? 0)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Returns completed</dt>
            <dd className="font-medium text-slate">{String(production.returns_completed ?? 0)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Prep fees collected</dt>
            <dd className="font-medium text-slate">{money(production.gross_prep_fees as number)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Bank product rebates</dt>
            <dd className="font-medium text-slate">{money(production.gross_bank_product_rebates as number)}</dd>
          </div>
        </dl>
        {otherFees.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Other fees collected (not split)</p>
            <dl className="mt-1.5 space-y-1 text-xs text-slate">
              {otherFees.map(([key, label]) => (
                <div key={key} className="flex justify-between">
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-medium">{money(production[key] as number)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {Object.keys(engagementsByStatus).length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Engagements by status</p>
            <ul className="mt-1.5 space-y-1 text-xs text-slate">
              {Object.entries(engagementsByStatus).map(([status, count]) => (
                <li key={status} className="flex justify-between">
                  <span className="text-muted">{status}</span>
                  <span className="font-medium">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className={cardClass}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Bank products</p>
        {bankProducts.length === 0 ? (
          <p className="mt-2 text-sm text-muted">None recorded this period.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {bankProducts.map((b, i) => (
              <li key={i} className="flex items-center justify-between">
                <span className="text-slate">
                  {b.bank_partner} <span className="text-muted">({b.product_type.replace("_", " ")})</span>
                </span>
                <span className="text-right">
                  <span className="block font-medium text-slate">{b.count}</span>
                  <span className="block text-xs text-muted">{money(b.total_rebate)} rebate</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PayoutLedger({ connectionId, payouts, hasPackage }: { connectionId: string; payouts: Payout[]; hasPackage: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [generating, setGenerating] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  async function generateThisMonth() {
    setGenerating(true);
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const periodEnd = now.toISOString().slice(0, 10);
    const { error } = await supabase.rpc("generate_firm_payout", {
      p_connection_id: connectionId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    });
    setGenerating(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Payout calculated for this month", "success");
    router.refresh();
  }

  async function markPaid(payoutId: string) {
    if (!window.confirm("Mark this payout as paid? This only records that you've sent the money outside Verexa -- it doesn't move any funds.")) return;
    setMarkingPaid(payoutId);
    const { error } = await supabase.rpc("mark_firm_payout_paid", { p_payout_id: payoutId });
    setMarkingPaid(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Marked paid", "success");
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Payout ledger</p>
        <button
          type="button"
          onClick={generateThisMonth}
          disabled={generating}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent disabled:opacity-60"
        >
          {generating ? "Calculating..." : "Calculate this month"}
        </button>
      </div>
      {!hasPackage && (
        <p className="mt-2 text-xs text-warning">No package assigned -- payouts will calculate with a 0% revenue share until one is set.</p>
      )}
      {payouts.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No payouts calculated yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-surfaceMuted text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Period</th>
                <th className="px-3 py-2 text-right">Gross collected</th>
                <th className="px-3 py-2 text-right">Fees deducted</th>
                <th className="px-3 py-2 text-right">Net production</th>
                <th className="px-3 py-2 text-right">Your share</th>
                <th className="px-3 py-2 text-right">Owed to firm</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payouts.map((p) => {
                const grossCollected = p.gross_prep_fees + p.gross_bank_product_rebates;
                const feesDeducted = p.gross_bank_fees + p.gross_addon_fees + p.gross_transmission_fees + p.gross_paperwork_fees;
                // Derived from the two numbers the split actually came from
                // (ero_share_amount + amount_owed_to_ptin), rather than
                // grossCollected - feesDeducted, so this always matches
                // exactly what generate_firm_payout computed -- the fee
                // deduction floors at 0 server-side and this stays in sync
                // with that even in the rare case fees exceed rebates.
                const netProduction = p.ero_share_amount + p.amount_owed_to_ptin;
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-slate">
                      {p.period_start} - {p.period_end}
                    </td>
                    <td className="px-3 py-2 text-right text-slate">{money(grossCollected)}</td>
                    <td className="px-3 py-2 text-right text-slate">{feesDeducted > 0 ? `-${money(feesDeducted)}` : money(0)}</td>
                    <td className="px-3 py-2 text-right text-slate">{money(netProduction)}</td>
                    <td className="px-3 py-2 text-right text-slate">{money(p.ero_share_amount)}</td>
                    <td className="px-3 py-2 text-right font-medium text-ink">{money(p.amount_owed_to_ptin)}</td>
                    <td className="px-3 py-2">
                      <Badge tone={p.status === "paid" ? "success" : p.status === "disputed" ? "danger" : "neutral"}>{p.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {p.status === "pending" && (
                        <button
                          type="button"
                          onClick={() => markPaid(p.id)}
                          disabled={markingPaid === p.id}
                          className="text-xs font-medium text-accent hover:underline disabled:opacity-60"
                        >
                          {markingPaid === p.id ? "Saving..." : "Mark paid"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function FirmDetailClient({
  connectionId,
  firmInfo,
  packageId,
  packages,
  bankPartnerId,
  banks,
  softwarePartnerId,
  softwareList,
  production,
  payouts,
  isActive,
}: {
  connectionId: string;
  parentWorkspaceId: string;
  firmInfo: FirmInfo;
  packageId: string | null;
  packages: PackageOption[];
  bankPartnerId: string | null;
  banks: PartnerOption[];
  softwarePartnerId: string | null;
  softwareList: PartnerOption[];
  production: Record<string, unknown> | null;
  payouts: Payout[];
  isActive: boolean;
}) {
  return (
    <div className="mt-4 space-y-6">
      <div className={cardClass}>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink">Firm info</p>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className={labelClass}>Contact email</dt>
            <dd className="text-slate">{firmInfo.primaryContactEmail ?? "--"}</dd>
          </div>
          <div>
            <dt className={labelClass}>Phone</dt>
            <dd className="text-slate">{firmInfo.phone ?? "--"}</dd>
          </div>
          <div>
            <dt className={labelClass}>Website</dt>
            <dd className="text-slate">{firmInfo.website ?? "--"}</dd>
          </div>
          <div>
            <dt className={labelClass}>Mailing address</dt>
            <dd className="text-slate">{firmInfo.mailingAddress ?? "--"}</dd>
          </div>
        </dl>
        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-3">
          <PackagePicker connectionId={connectionId} packageId={packageId} packages={packages} />
          <BankPicker connectionId={connectionId} bankPartnerId={bankPartnerId} banks={banks} />
          <SoftwarePicker connectionId={connectionId} softwarePartnerId={softwarePartnerId} softwareList={softwareList} />
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink">Production</p>
        <ProductionStats production={production} />
      </div>

      <div>
        <PayoutLedger connectionId={connectionId} payouts={payouts} hasPackage={Boolean(packageId)} />
      </div>
    </div>
  );
}
