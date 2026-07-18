"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { PayrollRun, PayrollRunItem, PayrollEmployee } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import PayrollRunItemModal from "@/components/PayrollRunItemModal";

const STATUS_STEPS = ["draft", "submitted", "processed"];

export default function PayrollRunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const router = useRouter();

  const [run, setRun] = useState<PayrollRun | null>(null);
  const [items, setItems] = useState<PayrollRunItem[]>([]);
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<PayrollRunItem | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function load() {
    setLoading(true);
    const { data: runData, error: runError } = await supabase
      .from("payroll_runs")
      .select("*")
      .eq("id", runId)
      .maybeSingle();

    if (runError || !runData) {
      setError(runError?.message ?? "Payroll run not found.");
      setLoading(false);
      return;
    }

    const r = runData as PayrollRun;
    setRun(r);

    const [itemsRes, employeesRes] = await Promise.all([
      supabase.from("payroll_run_items").select("*").eq("payroll_run_id", r.id),
      supabase.from("payroll_employees").select("*").eq("payroll_client_id", r.payroll_client_id),
    ]);

    setItems((itemsRes.data as PayrollRunItem[]) ?? []);
    setEmployees((employeesRes.data as PayrollEmployee[]) ?? []);
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    if (runId) load();
  }, [runId]);

  const totals = useMemo(() => {
    const gross = items.reduce((s, i) => s + Number(i.gross_pay), 0);
    const taxes = items.reduce((s, i) => s + Number(i.employee_taxes), 0);
    const deductions = items.reduce((s, i) => s + Number(i.deductions), 0);
    const net = items.reduce((s, i) => s + Number(i.net_pay), 0);
    return { gross, taxes, deductions, net };
  }, [items]);

  async function syncRunTotals() {
    if (!run) return;
    await supabase
      .from("payroll_runs")
      .update({
        gross_pay: totals.gross,
        employee_taxes: totals.taxes,
        deductions: totals.deductions,
        net_pay: totals.net,
        total_debit: totals.gross,
        employee_count: items.length,
      })
      .eq("id", run.id);
  }

  useEffect(() => {
    if (!loading && run) syncRunTotals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  async function advanceStatus(next: string) {
    if (!run) return;
    setUpdatingStatus(true);
    const payload: Record<string, unknown> = { run_status: next };
    if (next === "submitted") payload.submitted_at = new Date().toISOString();
    if (next === "processed") payload.processed_at = new Date().toISOString();
    const { error } = await supabase.from("payroll_runs").update(payload).eq("id", run.id);
    setUpdatingStatus(false);
    if (!error) setRun({ ...run, ...payload } as PayrollRun);
  }

  function employeeName(employeeId: string) {
    const e = employees.find((emp) => emp.id === employeeId);
    return e ? `${e.first_name} ${e.last_name}` : "—";
  }

  if (loading) return <div className="text-sm text-muted">Loading run…</div>;

  if (error || !run) {
    return (
      <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3">
        {error ?? "Not found."}
      </div>
    );
  }

  const currentIndex = STATUS_STEPS.indexOf(run.run_status);
  const nextStatus = STATUS_STEPS[currentIndex + 1];
  const existingEmployeeIds = items.map((i) => i.payroll_employee_id);

  return (
    <div>
      <button
        onClick={() => router.push(`/payroll/${run.payroll_client_id}`)}
        className="flex items-center gap-1.5 text-xs text-muted mb-4 hover:text-ink"
      >
        <ArrowLeft size={13} /> Back to Payroll Client
      </button>

      <div className="flex items-center gap-3 mb-2">
        <h1 className="font-slab text-2xl font-bold text-ink">
          {run.pay_period_start} → {run.pay_period_end}
        </h1>
        <StatusPill status={run.run_status} />
      </div>
      <div className="text-sm text-muted mb-6">Pay date {run.pay_date ?? "—"}</div>

      <div className="flex items-center gap-2 mb-6">
        {nextStatus && (
          <button
            onClick={() => advanceStatus(nextStatus)}
            disabled={updatingStatus}
            className="text-xs font-semibold px-3 py-1.5 rounded-sm bg-ink text-white disabled:opacity-60"
          >
            {updatingStatus
              ? "Updating…"
              : `Mark as ${nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}`}
          </button>
        )}
        <p className="text-xs text-muted">
          No payroll provider is connected — marking a run "Processed" here just
          tracks status; it doesn&apos;t move money or file taxes.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Gross
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-ink">
            ${totals.gross.toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Employee Taxes
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-brick">
            ${totals.taxes.toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Deductions
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-ink">
            ${totals.deductions.toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Net Pay
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-green">
            ${totals.net.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
        <h2 className="font-slab text-lg font-bold text-ink">Employees in this Run</h2>
        <button
          onClick={() => setShowItemModal(true)}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
        >
          <Plus size={13} /> Add Employee
        </button>
      </div>
      <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
        {items.length === 0 && (
          <div className="px-5 py-5 text-sm text-muted">No employees added to this run yet.</div>
        )}
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => setEditingItem(item)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-paper transition-colors"
          >
            <div>
              <div className="font-semibold text-ink text-sm">
                {employeeName(item.payroll_employee_id)}
              </div>
              <div className="text-xs text-muted mt-0.5">
                {item.regular_hours}h regular
                {Number(item.overtime_hours) > 0 ? ` · ${item.overtime_hours}h OT` : ""}
              </div>
            </div>
            <span className="text-sm font-mono tabular-nums text-ink">
              ${Number(item.net_pay).toLocaleString()}
            </span>
          </button>
        ))}
      </div>

      {showItemModal && (
        <PayrollRunItemModal
          payrollRunId={run.id}
          employees={employees}
          existingEmployeeIds={existingEmployeeIds}
          onClose={() => setShowItemModal(false)}
          onSaved={load}
        />
      )}
      {editingItem && (
        <PayrollRunItemModal
          payrollRunId={run.id}
          employees={employees}
          existingEmployeeIds={existingEmployeeIds}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={load}
          onDeleted={load}
        />
      )}
    </div>
  );
}
