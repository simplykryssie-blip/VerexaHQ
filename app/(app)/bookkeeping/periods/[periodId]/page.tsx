"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, CheckCircle2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  BookkeepingPeriod,
  BookkeepingTransaction,
  BookkeepingFinancialAccount,
  BookkeepingTransactionCategory,
  Client,
  ReconciliationSession,
  ReconciliationItem,
  BookkeepingAdjustment,
  BookkeepingReportDelivery,
} from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import TransactionModal from "@/components/TransactionModal";
import BankImportModal from "@/components/BankImportModal";
import AdjustmentModal from "@/components/AdjustmentModal";
import ReportDeliveryModal from "@/components/ReportDeliveryModal";
import CurrencyInput from "@/components/CurrencyInput";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function PeriodDetailPage() {
  const { periodId } = useParams<{ periodId: string }>();
  const router = useRouter();

  const [period, setPeriod] = useState<BookkeepingPeriod | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [accounts, setAccounts] = useState<BookkeepingFinancialAccount[]>([]);
  const [categories, setCategories] = useState<Map<string, BookkeepingTransactionCategory>>(
    new Map()
  );
  const [transactions, setTransactions] = useState<BookkeepingTransaction[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showTxnModal, setShowTxnModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingTxn, setEditingTxn] = useState<BookkeepingTransaction | null>(null);

  const [reconSession, setReconSession] = useState<ReconciliationSession | null>(null);
  const [reconItems, setReconItems] = useState<Map<string, ReconciliationItem>>(new Map());
  const [adjustments, setAdjustments] = useState<BookkeepingAdjustment[]>([]);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [startingRecon, setStartingRecon] = useState(false);
  const [beginningBalanceInput, setBeginningBalanceInput] = useState("");
  const [endingBalanceInput, setEndingBalanceInput] = useState("");

  const [reports, setReports] = useState<BookkeepingReportDelivery[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [editingReport, setEditingReport] = useState<BookkeepingReportDelivery | null>(null);

  async function load() {
    setLoading(true);
    const { data: periodData, error: periodError } = await supabase
      .from("bookkeeping_periods")
      .select("*")
      .eq("id", periodId)
      .maybeSingle();

    if (periodError || !periodData) {
      setError(periodError?.message ?? "Period not found.");
      setLoading(false);
      return;
    }

    const p = periodData as BookkeepingPeriod;
    setPeriod(p);

    const [clientRes, accountsRes, categoriesRes, txnRes] = await Promise.all([
      supabase.from("clients").select("*").eq("id", p.client_id).maybeSingle(),
      supabase
        .from("bookkeeping_financial_accounts")
        .select("*")
        .eq("engagement_id", p.engagement_id)
        .eq("is_active", true),
      supabase.from("bookkeeping_transaction_categories").select("*"),
      supabase
        .from("bookkeeping_transactions")
        .select("*")
        .eq("bookkeeping_period_id", p.id)
        .order("transaction_date", { ascending: false }),
    ]);

    setClient((clientRes.data as Client) ?? null);
    const accountList = (accountsRes.data as BookkeepingFinancialAccount[]) ?? [];
    setAccounts(accountList);
    if (accountList.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accountList[0].id);
    }

    const catMap = new Map<string, BookkeepingTransactionCategory>();
    (categoriesRes.data as BookkeepingTransactionCategory[] | null)?.forEach((c) =>
      catMap.set(c.id, c)
    );
    setCategories(catMap);

    setTransactions((txnRes.data as BookkeepingTransaction[]) ?? []);
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    if (periodId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId]);

  async function loadReconciliation(accountId: string) {
    if (!accountId || !period) return;
    const { data: sessionData } = await supabase
      .from("bookkeeping_reconciliation_sessions")
      .select("*")
      .eq("financial_account_id", accountId)
      .eq("bookkeeping_period_id", period.id)
      .maybeSingle();

    const session = (sessionData as ReconciliationSession) ?? null;
    setReconSession(session);

    if (session) {
      const [itemsRes, adjustmentsRes] = await Promise.all([
        supabase
          .from("bookkeeping_reconciliation_items")
          .select("*")
          .eq("reconciliation_session_id", session.id),
        supabase
          .from("bookkeeping_adjustments")
          .select("*")
          .eq("reconciliation_session_id", session.id)
          .order("created_at", { ascending: false }),
      ]);
      const itemsMap = new Map<string, ReconciliationItem>();
      (itemsRes.data as ReconciliationItem[] | null)?.forEach((it) =>
        itemsMap.set(it.transaction_id, it)
      );
      setReconItems(itemsMap);
      setAdjustments((adjustmentsRes.data as BookkeepingAdjustment[]) ?? []);
    } else {
      setReconItems(new Map());
      setAdjustments([]);
    }
  }

  useEffect(() => {
    if (selectedAccountId) loadReconciliation(selectedAccountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, period?.id]);

  const netTotal = useMemo(
    () => transactions.reduce((sum, t) => sum + Number(t.amount), 0),
    [transactions]
  );
  const uncategorizedCount = useMemo(
    () => transactions.filter((t) => !t.category_id).length,
    [transactions]
  );

  const accountTransactions = useMemo(
    () => transactions.filter((t) => t.financial_account_id === selectedAccountId),
    [transactions, selectedAccountId]
  );

  async function recomputeAndSaveSession(itemsMap: Map<string, ReconciliationItem>) {
    if (!reconSession) return;
    let deposits = 0;
    let withdrawals = 0;
    for (const t of accountTransactions) {
      const item = itemsMap.get(t.id);
      if (item?.cleared) {
        const amt = item.cleared_amount ?? Number(t.amount);
        if (amt >= 0) deposits += amt;
        else withdrawals += Math.abs(amt);
      }
    }
    const calculatedEnding = Number(reconSession.beginning_balance) + deposits - withdrawals;
    const difference = Number(reconSession.ending_balance) - calculatedEnding;

    const { error } = await supabase
      .from("bookkeeping_reconciliation_sessions")
      .update({
        cleared_deposits: deposits,
        cleared_withdrawals: withdrawals,
        calculated_ending_balance: calculatedEnding,
        difference,
      })
      .eq("id", reconSession.id);

    if (!error) {
      setReconSession({
        ...reconSession,
        cleared_deposits: deposits,
        cleared_withdrawals: withdrawals,
        calculated_ending_balance: calculatedEnding,
        difference,
      });
    }
  }

  async function startReconciliation() {
    if (!period || !selectedAccountId || !client) return;
    setStartingRecon(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    const { data, error } = await supabase
      .from("bookkeeping_reconciliation_sessions")
      .insert({
        workspace_id: period.workspace_id,
        client_id: client.id,
        financial_account_id: selectedAccountId,
        bookkeeping_period_id: period.id,
        statement_start_date: period.period_start,
        statement_end_date: period.period_end,
        beginning_balance: 0,
        ending_balance: 0,
        session_status: "draft",
        prepared_by: userId,
        prepared_at: new Date().toISOString(),
      })
      .select()
      .single();

    setStartingRecon(false);
    if (!error && data) {
      setReconSession(data as ReconciliationSession);
      setReconItems(new Map());
      setAdjustments([]);
    }
  }

  async function updateSessionBalance(field: "beginning_balance" | "ending_balance", value: string) {
    if (!reconSession) return;
    const parsed = parseFloat(value) || 0;
    const updated = { ...reconSession, [field]: parsed };
    const calculatedEnding =
      field === "beginning_balance"
        ? parsed + Number(reconSession.cleared_deposits) - Number(reconSession.cleared_withdrawals)
        : Number(reconSession.calculated_ending_balance);
    const difference =
      (field === "ending_balance" ? parsed : Number(reconSession.ending_balance)) -
      calculatedEnding;

    const { error } = await supabase
      .from("bookkeeping_reconciliation_sessions")
      .update({ [field]: parsed, calculated_ending_balance: calculatedEnding, difference })
      .eq("id", reconSession.id);

    if (!error) {
      setReconSession({ ...updated, calculated_ending_balance: calculatedEnding, difference });
    }
  }

  async function toggleCleared(txn: BookkeepingTransaction) {
    if (!reconSession) return;
    const existing = reconItems.get(txn.id);
    const nextCleared = !existing?.cleared;

    if (existing) {
      await supabase
        .from("bookkeeping_reconciliation_items")
        .update({ cleared: nextCleared })
        .eq("id", existing.id);
      const updatedMap = new Map(reconItems).set(txn.id, { ...existing, cleared: nextCleared });
      setReconItems(updatedMap);
      recomputeAndSaveSession(updatedMap);
    } else {
      const { data } = await supabase
        .from("bookkeeping_reconciliation_items")
        .insert({
          workspace_id: reconSession.workspace_id,
          reconciliation_session_id: reconSession.id,
          transaction_id: txn.id,
          cleared: nextCleared,
        })
        .select()
        .single();
      if (data) {
        const updatedMap = new Map(reconItems).set(txn.id, data as ReconciliationItem);
        setReconItems(updatedMap);
        recomputeAndSaveSession(updatedMap);
      }
    }
  }

  async function markReconciliationReviewed() {
    if (!reconSession || !period) return;
    await supabase
      .from("bookkeeping_reconciliation_sessions")
      .update({ session_status: "reviewed", reviewed_at: new Date().toISOString() })
      .eq("id", reconSession.id);
    await supabase
      .from("bookkeeping_periods")
      .update({ reconciliation_done: true })
      .eq("id", period.id);
    setReconSession({ ...reconSession, session_status: "reviewed" });
  }

  async function loadReports(periodId: string) {
    const { data } = await supabase
      .from("bookkeeping_report_deliveries")
      .select("*")
      .eq("bookkeeping_period_id", periodId)
      .order("created_at", { ascending: false });
    setReports((data as BookkeepingReportDelivery[]) ?? []);
  }

  useEffect(() => {
    if (period?.id) loadReports(period.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period?.id]);

  useEffect(() => {
    setBeginningBalanceInput(String(reconSession?.beginning_balance ?? ""));
    setEndingBalanceInput(String(reconSession?.ending_balance ?? ""));
  }, [reconSession?.id]);

  async function approveReport(report: BookkeepingReportDelivery) {
    const { error } = await supabase.rpc("transition_bookkeeping_report", {
      p_workspace_id: report.workspace_id,
      p_report_id: report.id,
      p_new_status: "approved",
    });
    if (!error && period) loadReports(period.id);
  }

  async function deliverReport(report: BookkeepingReportDelivery) {
    const { error } = await supabase
      .from("bookkeeping_report_deliveries")
      .update({ report_status: "delivered", delivered_at: new Date().toISOString() })
      .eq("id", report.id);
    if (!error && period) loadReports(period.id);
  }

  async function archiveReport(report: BookkeepingReportDelivery) {
    const { error } = await supabase.rpc("transition_bookkeeping_report", {
      p_workspace_id: report.workspace_id,
      p_report_id: report.id,
      p_new_status: "archived",
    });
    if (!error && period) loadReports(period.id);
  }

  if (loading) {
    return <div className="text-sm text-muted">Loading period…</div>;
  }

  if (error || !period) {
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
        onClick={() => router.push(`/bookkeeping/${period.engagement_id}`)}
        className="flex items-center gap-1.5 text-xs text-muted mb-4 hover:text-ink"
      >
        <ArrowLeft size={13} /> Back to {clientName}
      </button>

      <div className="flex items-center gap-3 mb-6">
        <h1 className="font-slab text-2xl font-bold text-ink">
          {period.period_month ? MONTH_NAMES[period.period_month - 1] : ""} {period.period_year}
        </h1>
        <StatusPill status={period.period_status} />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Transactions
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-ink">
            {transactions.length}
          </div>
        </div>
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Net Total
          </div>
          <div
            className="text-2xl font-bold font-mono tabular-nums"
            style={{ color: netTotal >= 0 ? "#0EA5A0" : "#B3261E" }}
          >
            {netTotal >= 0 ? "+" : "-"}${Math.abs(netTotal).toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Uncategorized
          </div>
          <div
            className="text-2xl font-bold font-mono tabular-nums"
            style={{ color: uncategorizedCount > 0 ? "#B45309" : "#0EA5A0" }}
          >
            {uncategorizedCount}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 border-b border-line pb-3">
        <h2 className="font-slab text-lg font-bold text-ink">Ledger</h2>
        <div className="flex items-center gap-2">
          {accounts.length > 0 && (
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowImportModal(true)}
            disabled={!selectedAccountId}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-sm border border-line text-ink disabled:opacity-50"
          >
            <Upload size={14} /> Import Statement
          </button>
          <button
            onClick={() => setShowTxnModal(true)}
            disabled={!selectedAccountId}
            className="flex items-center gap-1.5 bg-ink text-white text-sm font-semibold px-3.5 py-2 rounded-sm hover:bg-[#14273A] transition-colors disabled:opacity-50"
          >
            <Plus size={15} /> Add Transaction
          </button>
        </div>
      </div>

      {!selectedAccountId && (
        <div className="text-sm text-muted bg-white border border-line rounded-sm px-5 py-6 mb-4">
          Add a financial account to this engagement first before entering transactions.
        </div>
      )}

      <div className="bg-white border border-line rounded-sm overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-widest text-muted">
              <th className="px-5 py-3 font-semibold">Date</th>
              <th className="px-5 py-3 font-semibold">Description</th>
              <th className="px-5 py-3 font-semibold">Category</th>
              <th className="px-5 py-3 font-semibold text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paperDim">
            {transactions.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-muted">
                  No transactions in this period yet.
                </td>
              </tr>
            )}
            {transactions.map((t) => (
              <tr
                key={t.id}
                onClick={() => setEditingTxn(t)}
                className="hover:bg-paper transition-colors cursor-pointer"
              >
                <td className="px-5 py-3 font-mono text-xs text-muted">{t.transaction_date}</td>
                <td className="px-5 py-3">
                  <div className="font-medium text-ink">{t.description}</div>
                  {t.payee && <div className="text-xs text-muted">{t.payee}</div>}
                </td>
                <td className="px-5 py-3">
                  {t.category_id ? (
                    <span className="text-xs font-semibold text-ink">
                      {categories.get(t.category_id)?.category_name ?? "—"}
                    </span>
                  ) : (
                    <StatusPill status="Uncategorized" />
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <span
                    className="font-mono tabular-nums font-semibold"
                    style={{ color: Number(t.amount) >= 0 ? "#0EA5A0" : "#B3261E" }}
                  >
                    {Number(t.amount) >= 0 ? "+" : "-"}$
                    {Math.abs(Number(t.amount)).toLocaleString()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showTxnModal && client && selectedAccountId && (
        <TransactionModal
          clientId={client.id}
          workspaceId={period.workspace_id}
          financialAccountId={selectedAccountId}
          periodId={period.id}
          onClose={() => setShowTxnModal(false)}
          onSaved={load}
        />
      )}
      {showImportModal && client && selectedAccountId && (
        <BankImportModal
          workspaceId={period.workspace_id}
          clientId={client.id}
          financialAccountId={selectedAccountId}
          bookkeepingPeriodId={period.id}
          onClose={() => setShowImportModal(false)}
          onSaved={load}
        />
      )}
      {editingTxn && client && (
        <TransactionModal
          clientId={client.id}
          workspaceId={period.workspace_id}
          financialAccountId={editingTxn.financial_account_id}
          periodId={period.id}
          transaction={editingTxn}
          onClose={() => setEditingTxn(null)}
          onSaved={load}
          onDeleted={load}
        />
      )}

      {selectedAccountId && (
        <section className="mt-10">
          <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
            <h2 className="font-slab text-lg font-bold text-ink">Reconciliation</h2>
            {reconSession?.session_status === "reviewed" && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-green">
                <CheckCircle2 size={14} /> Reviewed
              </div>
            )}
          </div>

          {!reconSession ? (
            <div className="bg-white border border-line rounded-sm px-5 py-6 text-sm text-muted flex items-center justify-between">
              <span>No reconciliation started for this account/period yet.</span>
              <button
                onClick={startReconciliation}
                disabled={startingRecon}
                className="text-xs font-semibold px-3 py-1.5 rounded-sm bg-ink text-white disabled:opacity-60"
              >
                {startingRecon ? "Starting…" : "Start Reconciliation"}
              </button>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="bg-white border border-line rounded-sm p-4">
                  <label className="text-[11px] uppercase tracking-widest text-muted font-semibold block mb-1">
                    Beginning Balance
                  </label>
                  <CurrencyInput
                    value={beginningBalanceInput}
                    onChange={setBeginningBalanceInput}
                    onBlur={(value) => updateSessionBalance("beginning_balance", value)}
                    className="w-full"
                  />
                </div>
                <div className="bg-white border border-line rounded-sm p-4">
                  <label className="text-[11px] uppercase tracking-widest text-muted font-semibold block mb-1">
                    Statement Ending Balance
                  </label>
                  <CurrencyInput
                    value={endingBalanceInput}
                    onChange={setEndingBalanceInput}
                    onBlur={(value) => updateSessionBalance("ending_balance", value)}
                    className="w-full"
                  />
                </div>
                <div className="bg-white border border-line rounded-sm p-4">
                  <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
                    Calculated Balance
                  </div>
                  <div className="text-sm font-mono tabular-nums text-ink">
                    ${Number(reconSession.calculated_ending_balance).toLocaleString()}
                  </div>
                </div>
                <div className="bg-white border border-line rounded-sm p-4">
                  <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
                    Difference
                  </div>
                  <div
                    className="text-sm font-mono tabular-nums font-bold"
                    style={{ color: Number(reconSession.difference) === 0 ? "#0EA5A0" : "#B3261E" }}
                  >
                    ${Number(reconSession.difference).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => setShowAdjustmentModal(true)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
                >
                  Add Adjustment
                </button>
                {Number(reconSession.difference) === 0 && reconSession.session_status !== "reviewed" && (
                  <button
                    onClick={markReconciliationReviewed}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm bg-ink text-white"
                  >
                    <CheckCircle2 size={13} /> Mark Reviewed
                  </button>
                )}
              </div>

              {adjustments.length > 0 && (
                <div className="bg-white border border-line rounded-sm divide-y divide-paperDim mb-4">
                  {adjustments.map((adj) => (
                    <div key={adj.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <div className="text-sm font-semibold text-ink">{adj.adjustment_type}</div>
                        <div className="text-xs text-muted">{adj.description}</div>
                      </div>
                      <span
                        className="text-sm font-mono tabular-nums"
                        style={{ color: adj.amount >= 0 ? "#0EA5A0" : "#B3261E" }}
                      >
                        {adj.amount >= 0 ? "+" : "-"}${Math.abs(adj.amount).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                Clear transactions against the statement
              </div>
              <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
                {accountTransactions.length === 0 && (
                  <div className="px-5 py-5 text-sm text-muted">
                    No transactions for this account in this period yet.
                  </div>
                )}
                {accountTransactions.map((t) => {
                  const cleared = reconItems.get(t.id)?.cleared ?? false;
                  return (
                    <label
                      key={t.id}
                      className="flex items-center justify-between px-5 py-3 cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={cleared}
                          onChange={() => toggleCleared(t)}
                          className="w-4 h-4 accent-[#0D1B2A]"
                        />
                        <div>
                          <div className="text-sm font-medium text-ink">{t.description}</div>
                          <div className="text-xs text-muted font-mono">{t.transaction_date}</div>
                        </div>
                      </div>
                      <span
                        className="text-sm font-mono tabular-nums"
                        style={{ color: Number(t.amount) >= 0 ? "#0EA5A0" : "#B3261E" }}
                      >
                        {Number(t.amount) >= 0 ? "+" : "-"}$
                        {Math.abs(Number(t.amount)).toLocaleString()}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {showAdjustmentModal && client && reconSession && (
        <AdjustmentModal
          workspaceId={period.workspace_id}
          clientId={client.id}
          financialAccountId={selectedAccountId}
          reconciliationSessionId={reconSession.id}
          onClose={() => setShowAdjustmentModal(false)}
          onSaved={() => loadReconciliation(selectedAccountId)}
        />
      )}

      <section className="mt-10">
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <h2 className="font-slab text-lg font-bold text-ink">Client Reports</h2>
          <button
            onClick={() => setShowReportModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            <Plus size={13} /> New Report
          </button>
        </div>
        <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
          {reports.length === 0 && (
            <div className="px-5 py-5 text-sm text-muted">
              No reports created for this period yet.
            </div>
          )}
          {reports.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-5 py-3.5">
              <button onClick={() => setEditingReport(r)} className="text-left flex-1">
                <div className="font-semibold text-ink text-sm">{r.report_title}</div>
                <div className="text-xs text-muted mt-0.5">
                  {r.report_type.replaceAll("_", " ")}
                </div>
              </button>
              <div className="flex items-center gap-2">
                <StatusPill status={r.report_status.replaceAll("_", " ")} />
                {r.report_status === "ready_for_review" && (
                  <button
                    onClick={() => approveReport(r)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-sm bg-ink text-white"
                  >
                    Approve
                  </button>
                )}
                {r.report_status === "approved" && (
                  <button
                    onClick={() => deliverReport(r)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-sm bg-ink text-white"
                  >
                    Deliver to Client
                  </button>
                )}
                {(r.report_status === "delivered" || r.report_status === "client_viewed") && (
                  <button
                    onClick={() => archiveReport(r)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
                  >
                    Archive
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {showReportModal && client && (
        <ReportDeliveryModal
          workspaceId={period.workspace_id}
          clientId={client.id}
          bookkeepingPeriodId={period.id}
          onClose={() => setShowReportModal(false)}
          onSaved={() => loadReports(period.id)}
        />
      )}
      {editingReport && client && (
        <ReportDeliveryModal
          workspaceId={period.workspace_id}
          clientId={client.id}
          bookkeepingPeriodId={period.id}
          report={editingReport}
          onClose={() => setEditingReport(null)}
          onSaved={() => loadReports(period.id)}
        />
      )}
    </div>
  );
}
