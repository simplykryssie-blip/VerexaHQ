"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PayrollEmployee } from "@/lib/types";

export default function PayrollEmployeeModal({
  payrollClientId,
  clientId,
  employee,
  onClose,
  onSaved,
  onDeleted,
}: {
  payrollClientId: string;
  clientId: string;
  employee?: PayrollEmployee;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEditing = !!employee;
  const [firstName, setFirstName] = useState(employee?.first_name ?? "");
  const [lastName, setLastName] = useState(employee?.last_name ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [workerType, setWorkerType] = useState(employee?.worker_type ?? "employee");
  const [payType, setPayType] = useState(employee?.pay_type ?? "hourly");
  const [hourlyRate, setHourlyRate] = useState(employee?.hourly_rate?.toString() ?? "");
  const [annualSalary, setAnnualSalary] = useState(employee?.annual_salary?.toString() ?? "");
  const [status, setStatus] = useState(employee?.employment_status ?? "active");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      first_name: firstName,
      last_name: lastName,
      email: email || null,
      worker_type: workerType,
      pay_type: payType,
      hourly_rate: payType === "hourly" && hourlyRate ? parseFloat(hourlyRate) : null,
      annual_salary: payType === "salary" && annualSalary ? parseFloat(annualSalary) : null,
      employment_status: status,
    };

    if (isEditing) {
      const { error } = await supabase
        .from("payroll_employees")
        .update(payload)
        .eq("id", employee!.id);
      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      onSaved();
      onClose();
      return;
    }

    const { error } = await supabase.from("payroll_employees").insert({
      payroll_client_id: payrollClientId,
      client_id: clientId,
      hire_date: new Date().toISOString().slice(0, 10),
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
    if (!employee) return;
    if (!window.confirm(`Remove ${employee.first_name} ${employee.last_name}?`)) return;
    setDeleting(true);
    const { error } = await supabase.from("payroll_employees").delete().eq("id", employee.id);
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
      <div className="bg-white rounded-sm border border-line w-full max-w-md p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">
          {isEditing ? "Edit Employee" : "New Employee"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <input
              required
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            />
            <input
              required
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            />
          </div>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />

          <div className="flex gap-2">
            <select
              value={workerType}
              onChange={(e) => setWorkerType(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            >
              <option value="employee">Employee (W-2)</option>
              <option value="contractor">Contractor (1099)</option>
            </select>
            <select
              value={payType}
              onChange={(e) => setPayType(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            >
              <option value="hourly">Hourly</option>
              <option value="salary">Salary</option>
            </select>
          </div>

          {payType === "hourly" ? (
            <input
              type="number"
              step="0.01"
              placeholder="Hourly rate"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            />
          ) : (
            <input
              type="number"
              step="0.01"
              placeholder="Annual salary"
              value={annualSalary}
              onChange={(e) => setAnnualSalary(e.target.value)}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            />
          )}

          {isEditing && (
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            >
              <option value="active">Active</option>
              <option value="on_leave">On Leave</option>
              <option value="terminated">Terminated</option>
            </select>
          )}

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
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Employee"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
