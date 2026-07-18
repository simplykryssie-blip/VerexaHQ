"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  BookkeepingEngagement,
  BookkeepingFinancialAccount,
  BookkeepingPeriod,
  Client,
} from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import EngagementModal from "@/components/EngagementModal";
import FinancialAccountModal from "@/components/FinancialAccountModal";
import PeriodModal from "@/components/PeriodModal";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function EngagementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [engagement, setEngagement] = useState<BookkeepingEngagement | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [accounts, setAccounts] = useState<BookkeepingFinancialAccount[]>([]);
  const [periods, setPeriods] = useState<BookkeepingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showEngagementModal, setShowEngagementModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BookkeepingFinancialAccount | null>(null);
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<BookkeepingPeriod | null>(null);

  async function load() {
    setLoading(true);
    const { data: engagementData, error: engagementError } = await supabase
      .from("bookkeeping_engagements")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (engagementError || !engagementData) {
      setError(engagementError?.message ?? "Engagement not found.");
      setLoading(false);
      return;
    }

    const e = engagementData as BookkeepingEngagement;
    setEngagement(e);

    const [clientRes, accountsRes, periodsRes] = await Promise.all([
      supabase.from("clients").select("*").eq("id", e.client_id).maybeSingle(),
      supabase
        .from("bookkeeping_financial_accounts")
        .select("*")
        .eq("engagement_id", e.id)
        .eq("is_active", true),
      supabase
        .from("bookkeeping_periods")
        .select("*")
        .eq("engagement_id", e.id)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false }),
    ]);

    setClient((clientRes.data as Client) ?? null);
    setAccounts((accountsRes.data as BookkeepingFinancialAccount[]) ?? []);
    setPeriods((periodsRes.data as BookkeepingPeriod[]) ?? []);
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  async function toggleChecklistItem(period: BookkeepingPeriod, field: keyof BookkeepingPeriod) {
    const nextValue = !period[field];
    const { error } = await supabase
      .from("bookkeeping_periods")
      .update({ [field]: nextValue })
      .eq("id", period.id);
    if (!error) {
      setPeriods((prev) =>
        prev.map((p) => (p.id === period.id ? { ...p, [field]: nextValue } : p))
      );
    }
  }

  if (loading) {
    return <div className="text-sm text-muted">Loading engagement…</div>;
  }

  if (error || !engagement) {
    return (
      <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3">
        {error ?? "Not found."}
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
        onClick={() => router.push("/bookkeeping")}
        className="flex items-center gap-1.5 text-xs text-muted mb-4 hover:text-ink"
      >
        <ArrowLeft size={13} /> Back to Bookkeeping
      </button>

      <div className="flex items-center gap-3 mb-6">
        <h1 className="font-slab text-2xl font-bold text-ink">{clientName}</h1>
        <StatusPill status={engagement.engagement_status} />
        {engagement.cleanup_needed && <StatusPill status="Needs Cleanup" />}
        <button
          onClick={() => setShowEngagementModal(true)}
          className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
        >
          <Pencil size={13} /> Edit
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Software
          </div>
          <div className="text-sm text-ink">{engagement.bookkeeping_software || "—"}</div>
        </div>
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Frequency
          </div>
          <div className="text-sm text-ink capitalize">{engagement.frequency || "—"}</div>
        </div>
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Monthly Fee
          </div>
          <div className="text-sm font-mono tabular-nums text-ink">
            {engagement.monthly_fee ? `$${engagement.monthly_fee.toLocaleString()}` : "—"}
          </div>
        </div>
      </div>

      <section className="mb-8">
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <h2 className="font-slab text-lg font-bold text-ink">Financial Accounts</h2>
          <button
            onClick={() => setShowAccountModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            <Plus size={13} /> Add Account
          </button>
        </div>
        <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
          {accounts.length === 0 && (
            <div className="px-5 py-5 text-sm text-muted">No accounts added yet.</div>
          )}
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => setEditingAccount(a)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-paper transition-colors"
            >
              <div>
                <div className="font-semibold text-ink text-sm">{a.account_name}</div>
                <div className="text-xs text-muted mt-0.5">
                  {a.institution_name} {a.masked_account_number}
                </div>
              </div>
              <span className="text-xs uppercase tracking-wide text-muted font-mono">
                {a.account_type?.replaceAll("_", " ")}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <h2 className="font-slab text-lg font-bold text-ink">Periods</h2>
          <button
            onClick={() => setShowPeriodModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            <Plus size={13} /> New Period
          </button>
        </div>
        <div className="space-y-3">
          {periods.length === 0 && (
            <div className="bg-white border border-line rounded-sm px-5 py-5 text-sm text-muted">
              No periods yet. Create one for the current month to start tracking the close.
            </div>
          )}
          {periods.map((p) => (
            <div key={p.id} className="bg-white border border-line rounded-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <Link
                  href={`/bookkeeping/periods/${p.id}`}
                  className="font-semibold text-ink text-sm hover:underline"
                >
                  {p.period_month ? MONTH_NAMES[p.period_month - 1] : ""} {p.period_year}
                </Link>
                <div className="flex items-center gap-2">
                  <StatusPill status={p.period_status} />
                  <button
                    onClick={() => setEditingPeriod(p)}
                    className="text-muted hover:text-ink"
                    aria-label="Edit period"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-xs">
                {(
                  [
                    ["bank_statements_received", "Bank statements"],
                    ["credit_card_statements_received", "CC statements"],
                    ["reconciliation_done", "Reconciled"],
                    ["reports_sent", "Reports sent"],
                    ["client_approved", "Client approved"],
                  ] as [keyof BookkeepingPeriod, string][]
                ).map(([field, label]) => (
                  <label key={field} className="flex items-center gap-1.5 text-muted">
                    <input
                      type="checkbox"
                      checked={!!p[field]}
                      onChange={() => toggleChecklistItem(p, field)}
                      className="accent-[#0D1B2A]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {showEngagementModal && (
        <EngagementModal
          engagement={engagement}
          onClose={() => setShowEngagementModal(false)}
          onSaved={load}
          onDeleted={() => router.push("/bookkeeping")}
        />
      )}
      {showAccountModal && client && (
        <FinancialAccountModal
          clientId={client.id}
          engagementId={engagement.id}
          onClose={() => setShowAccountModal(false)}
          onSaved={load}
        />
      )}
      {editingAccount && client && (
        <FinancialAccountModal
          clientId={client.id}
          engagementId={engagement.id}
          account={editingAccount}
          onClose={() => setEditingAccount(null)}
          onSaved={load}
          onDeleted={load}
        />
      )}
      {showPeriodModal && client && (
        <PeriodModal
          clientId={client.id}
          engagementId={engagement.id}
          onClose={() => setShowPeriodModal(false)}
          onSaved={load}
        />
      )}
      {editingPeriod && client && (
        <PeriodModal
          clientId={client.id}
          engagementId={engagement.id}
          period={editingPeriod}
          onClose={() => setEditingPeriod(null)}
          onSaved={load}
          onDeleted={load}
        />
      )}
    </div>
  );
}
