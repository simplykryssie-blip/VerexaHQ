"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  PayrollClient,
  PayrollEmployee,
  PayrollRun,
  PayrollFiling,
  PayrollTaxDeposit,
  Client,
} from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import PayrollClientModal from "@/components/PayrollClientModal";
import PayrollEmployeeModal from "@/components/PayrollEmployeeModal";
import PayrollRunModal from "@/components/PayrollRunModal";
import PayrollFilingModal from "@/components/PayrollFilingModal";
import PayrollTaxDepositModal from "@/components/PayrollTaxDepositModal";

export default function PayrollClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [payrollClient, setPayrollClient] = useState<PayrollClient | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [filings, setFilings] = useState<PayrollFiling[]>([]);
  const [deposits, setDeposits] = useState<PayrollTaxDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<PayrollEmployee | null>(null);
  const [showRunModal, setShowRunModal] = useState(false);
  const [showFilingModal, setShowFilingModal] = useState(false);
  const [editingFiling, setEditingFiling] = useState<PayrollFiling | null>(null);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState<PayrollTaxDeposit | null>(null);

  async function load() {
    setLoading(true);
    const { data: pcData, error: pcError } = await supabase
      .from("payroll_clients")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (pcError || !pcData) {
      setError(pcError?.message ?? "Payroll client not found.");
      setLoading(false);
      return;
    }

    const pc = pcData as PayrollClient;
    setPayrollClient(pc);

    const [clientRes, employeesRes, runsRes, filingsRes, depositsRes] = await Promise.all([
      supabase.from("clients").select("*").eq("id", pc.client_id).maybeSingle(),
      supabase.from("payroll_employees").select("*").eq("payroll_client_id", pc.id),
      supabase
        .from("payroll_runs")
        .select("*")
        .eq("payroll_client_id", pc.id)
        .order("pay_date", { ascending: false }),
      supabase
        .from("payroll_filings")
        .select("*")
        .eq("payroll_client_id", pc.id)
        .order("due_date", { ascending: true }),
      supabase
        .from("payroll_tax_deposits")
        .select("*")
        .eq("payroll_client_id", pc.id)
        .order("due_date", { ascending: true }),
    ]);

    setClient((clientRes.data as Client) ?? null);
    setEmployees((employeesRes.data as PayrollEmployee[]) ?? []);
    setRuns((runsRes.data as PayrollRun[]) ?? []);
    setFilings((filingsRes.data as PayrollFiling[]) ?? []);
    setDeposits((depositsRes.data as PayrollTaxDeposit[]) ?? []);
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  if (loading) return <div className="text-sm text-muted">Loading…</div>;

  if (error || !payrollClient) {
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
        onClick={() => router.push("/payroll")}
        className="flex items-center gap-1.5 text-xs text-muted mb-4 hover:text-ink"
      >
        <ArrowLeft size={13} /> Back to Payroll
      </button>

      <div className="flex items-center gap-3 mb-6">
        <h1 className="font-slab text-2xl font-bold text-ink">{clientName}</h1>
        <StatusPill status={payrollClient.payroll_status.replaceAll("_", " ")} />
        <button
          onClick={() => setShowEditModal(true)}
          className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
        >
          <Pencil size={13} /> Edit
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Pay Frequency
          </div>
          <div className="text-sm text-ink capitalize">{payrollClient.pay_frequency}</div>
        </div>
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Provider
          </div>
          <div className="text-sm text-ink">{payrollClient.provider_name || "Not connected"}</div>
        </div>
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Next Pay Date
          </div>
          <div className="text-sm font-mono text-ink">{payrollClient.next_pay_date || "—"}</div>
        </div>
      </div>

      <section className="mb-8">
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <h2 className="font-slab text-lg font-bold text-ink">Employees</h2>
          <button
            onClick={() => setShowEmployeeModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            <Plus size={13} /> Add
          </button>
        </div>
        <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
          {employees.length === 0 && (
            <div className="px-5 py-5 text-sm text-muted">No employees yet.</div>
          )}
          {employees.map((emp) => (
            <button
              key={emp.id}
              onClick={() => setEditingEmployee(emp)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-paper transition-colors"
            >
              <div>
                <div className="font-semibold text-ink text-sm">
                  {emp.first_name} {emp.last_name}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {emp.worker_type === "contractor" ? "1099 Contractor" : "W-2 Employee"} ·{" "}
                  {emp.pay_type === "hourly"
                    ? `$${emp.hourly_rate ?? 0}/hr`
                    : `$${emp.annual_salary?.toLocaleString() ?? 0}/yr`}
                </div>
              </div>
              <StatusPill status={emp.employment_status.replaceAll("_", " ")} />
            </button>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <h2 className="font-slab text-lg font-bold text-ink">Payroll Runs</h2>
          <button
            onClick={() => setShowRunModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            <Plus size={13} /> New Run
          </button>
        </div>
        <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
          {runs.length === 0 && (
            <div className="px-5 py-5 text-sm text-muted">No payroll runs yet.</div>
          )}
          {runs.map((r) => (
            <Link
              key={r.id}
              href={`/payroll/runs/${r.id}`}
              className="flex flex-col gap-2 px-5 py-3.5 hover:bg-paper transition-colors sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="font-semibold text-ink text-sm">
                  {r.pay_period_start} → {r.pay_period_end}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  Pay date {r.pay_date ?? "—"} · {r.employee_count} employee
                  {r.employee_count === 1 ? "" : "s"}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-mono tabular-nums text-ink">
                  ${Number(r.net_pay).toLocaleString()}
                </span>
                <StatusPill status={r.run_status} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <h2 className="font-slab text-lg font-bold text-ink">Filings</h2>
          <button
            onClick={() => setShowFilingModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            <Plus size={13} /> Add
          </button>
        </div>
        <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
          {filings.length === 0 && (
            <div className="px-5 py-5 text-sm text-muted">No filings tracked yet.</div>
          )}
          {filings.map((f) => (
            <button
              key={f.id}
              onClick={() => setEditingFiling(f)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-paper transition-colors"
            >
              <div>
                <div className="font-semibold text-ink text-sm">
                  {f.filing_type} — {f.jurisdiction}
                </div>
                <div className="text-xs text-muted mt-0.5">Due {f.due_date ?? "—"}</div>
              </div>
              <StatusPill status={f.filing_status.replaceAll("_", " ")} />
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <h2 className="font-slab text-lg font-bold text-ink">Tax Deposits</h2>
          <button
            onClick={() => setShowDepositModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            <Plus size={13} /> Add
          </button>
        </div>
        <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
          {deposits.length === 0 && (
            <div className="px-5 py-5 text-sm text-muted">No tax deposits tracked yet.</div>
          )}
          {deposits.map((d) => (
            <button
              key={d.id}
              onClick={() => setEditingDeposit(d)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-paper transition-colors"
            >
              <div>
                <div className="font-semibold text-ink text-sm">
                  {d.tax_type} — {d.jurisdiction}
                </div>
                <div className="text-xs text-muted mt-0.5">Due {d.due_date ?? "—"}</div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-mono tabular-nums text-ink">
                  ${Number(d.amount).toLocaleString()}
                </span>
                <StatusPill status={d.deposit_status} />
              </div>
            </button>
          ))}
        </div>
      </section>

      {showEditModal && (
        <PayrollClientModal
          payrollClient={payrollClient}
          onClose={() => setShowEditModal(false)}
          onSaved={load}
          onDeleted={() => router.push("/payroll")}
        />
      )}
      {showEmployeeModal && (
        <PayrollEmployeeModal
          payrollClientId={payrollClient.id}
          clientId={payrollClient.client_id}
          onClose={() => setShowEmployeeModal(false)}
          onSaved={load}
        />
      )}
      {editingEmployee && (
        <PayrollEmployeeModal
          payrollClientId={payrollClient.id}
          clientId={payrollClient.client_id}
          employee={editingEmployee}
          onClose={() => setEditingEmployee(null)}
          onSaved={load}
          onDeleted={load}
        />
      )}
      {showRunModal && (
        <PayrollRunModal
          payrollClientId={payrollClient.id}
          clientId={payrollClient.client_id}
          onClose={() => setShowRunModal(false)}
          onSaved={load}
        />
      )}
      {showFilingModal && (
        <PayrollFilingModal
          payrollClientId={payrollClient.id}
          clientId={payrollClient.client_id}
          onClose={() => setShowFilingModal(false)}
          onSaved={load}
        />
      )}
      {editingFiling && (
        <PayrollFilingModal
          payrollClientId={payrollClient.id}
          clientId={payrollClient.client_id}
          filing={editingFiling}
          onClose={() => setEditingFiling(null)}
          onSaved={load}
          onDeleted={load}
        />
      )}
      {showDepositModal && (
        <PayrollTaxDepositModal
          payrollClientId={payrollClient.id}
          clientId={payrollClient.client_id}
          onClose={() => setShowDepositModal(false)}
          onSaved={load}
        />
      )}
      {editingDeposit && (
        <PayrollTaxDepositModal
          payrollClientId={payrollClient.id}
          clientId={payrollClient.client_id}
          deposit={editingDeposit}
          onClose={() => setEditingDeposit(null)}
          onSaved={load}
          onDeleted={load}
        />
      )}
    </div>
  );
}
