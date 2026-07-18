"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PayrollEmployee, PayrollRunItem } from "@/lib/types";
import CurrencyInput from "@/components/CurrencyInput";

export default function PayrollRunItemModal({
  payrollRunId,
  employees,
  existingEmployeeIds,
  item,
  onClose,
  onSaved,
  onDeleted,
}: {
  payrollRunId: string;
  employees: PayrollEmployee[];
  existingEmployeeIds: string[];
  item?: PayrollRunItem;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEditing = !!item;
  const [employeeId, setEmployeeId] = useState(item?.payroll_employee_id ?? "");
  const [regularHours, setRegularHours] = useState(item?.regular_hours?.toString() ?? "0");
  const [overtimeHours, setOvertimeHours] = useState(item?.overtime_hours?.toString() ?? "0");
  const [regularPay, setRegularPay] = useState(item?.regular_pay?.toString() ?? "0");
  const [overtimePay, setOvertimePay] = useState(item?.overtime_pay?.toString() ?? "0");
  const [otherPay, setOtherPay] = useState(item?.other_pay?.toString() ?? "0");
  const [employeeTaxes, setEmployeeTaxes] = useState(item?.employee_taxes?.toString() ?? "0");
  const [deductions, setDeductions] = useState(item?.deductions?.toString() ?? "0");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableEmployees = employees.filter(
    (e) => e.id === item?.payroll_employee_id || !existingEmployeeIds.includes(e.id)
  );

  const gross =
    (parseFloat(regularPay) || 0) + (parseFloat(overtimePay) || 0) + (parseFloat(otherPay) || 0);
  const net = gross - (parseFloat(employeeTaxes) || 0) - (parseFloat(deductions) || 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId) {
      setError("Choose an employee.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      regular_hours: parseFloat(regularHours) || 0,
      overtime_hours: parseFloat(overtimeHours) || 0,
      regular_pay: parseFloat(regularPay) || 0,
      overtime_pay: parseFloat(overtimePay) || 0,
      other_pay: parseFloat(otherPay) || 0,
      gross_pay: gross,
      employee_taxes: parseFloat(employeeTaxes) || 0,
      deductions: parseFloat(deductions) || 0,
      net_pay: net,
    };

    if (isEditing) {
      const { error } = await supabase
        .from("payroll_run_items")
        .update(payload)
        .eq("id", item!.id);
      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      onSaved();
      onClose();
      return;
    }

    const { error } = await supabase.from("payroll_run_items").insert({
      payroll_run_id: payrollRunId,
      payroll_employee_id: employeeId,
      ...payload,
    });

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!item) return;
    if (!window.confirm("Remove this employee from the run?")) return;
    setDeleting(true);
    const { error } = await supabase.from("payroll_run_items").delete().eq("id", item.id);
    setDeleting(false);
    if (error) {
      setError(error.message);
      return;
    }
    onDeleted?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-sm p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">
          {isEditing ? "Edit Line Item" : "Add Employee to Run"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <select
            required
            disabled={isEditing}
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm disabled:bg-paperDim"
          >
            <option value="">Select employee…</option>
            {availableEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.first_name} {emp.last_name}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <input
              type="number"
              step="0.01"
              placeholder="Regular hours"
              value={regularHours}
              onChange={(e) => setRegularHours(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            />
            <input
              type="number"
              step="0.01"
              placeholder="OT hours"
              value={overtimeHours}
              onChange={(e) => setOvertimeHours(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <CurrencyInput
              placeholder="Regular pay"
              value={regularPay}
              onChange={setRegularPay}
              className="w-1/2"
            />
            <CurrencyInput
              placeholder="OT pay"
              value={overtimePay}
              onChange={setOvertimePay}
              className="w-1/2"
            />
          </div>
          <CurrencyInput
            placeholder="Other pay (bonus, commission)"
            value={otherPay}
            onChange={setOtherPay}
            className="w-full"
          />
          <div className="flex gap-2">
            <CurrencyInput
              placeholder="Employee taxes withheld"
              value={employeeTaxes}
              onChange={setEmployeeTaxes}
              className="w-1/2"
            />
            <CurrencyInput
              placeholder="Other deductions"
              value={deductions}
              onChange={setDeductions}
              className="w-1/2"
            />
          </div>

          <div className="bg-paper border border-line rounded-sm px-3 py-2 flex justify-between text-sm font-mono">
            <span>Gross: ${gross.toFixed(2)}</span>
            <span>Net: ${net.toFixed(2)}</span>
          </div>

          {error && (
            <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {isEditing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="text-sm font-semibold py-2 px-3 rounded-sm border border-brick text-brick disabled:opacity-60"
              >
                {deleting ? "Removing…" : "Remove"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-sm font-semibold py-2 rounded-sm border border-line text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 text-sm font-semibold py-2 rounded-sm bg-ink text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
