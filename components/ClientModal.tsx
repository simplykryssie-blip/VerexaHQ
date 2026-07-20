"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Client } from "@/lib/types";
import { clientDisplayName } from "@/lib/clientDisplay";

// Values must match the live `clients.account_type` check constraint:
// individual | household | business | estate | trust | nonprofit | other
const ACCOUNT_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "household", label: "Household" },
  { value: "business", label: "Business" },
  { value: "trust", label: "Trust" },
  { value: "estate", label: "Estate" },
  { value: "nonprofit", label: "Nonprofit" },
  { value: "other", label: "Other" },
];

const ENTITY_TYPES = new Set(["business", "trust", "estate", "nonprofit", "other"]);

const ENTITY_NAME_LABEL: Record<string, string> = {
  business: "Business name",
  trust: "Trust name",
  estate: "Estate name",
  nonprofit: "Organization name",
  other: "Account name",
};

// clients.client_type only allows individual | business | family — this app's
// other pages branch on client_type === "business" to decide whether to show
// business_name, so every entity-style account_type maps to "business" here
// and "household" maps to the legacy "family" value.
function deriveClientType(accountType: string): "individual" | "business" | "family" {
  if (accountType === "individual") return "individual";
  if (accountType === "household") return "family";
  return "business";
}

const SERVICE_OPTIONS = [
  "Bookkeeping",
  "Tax Preparation",
  "Payroll",
  "Financial Statements",
  "Sales Tax",
  "Advisory & Consulting",
  "Audit & Assurance",
];

export default function ClientModal({
  client,
  onClose,
  onSaved,
  onDeleted,
}: {
  client?: Client;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEditing = !!client;
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    account_type: client?.account_type ?? "individual",
    first_name: client?.first_name ?? "",
    last_name: client?.last_name ?? "",
    business_name: client?.business_name ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    status: client?.status ?? "lead",
    source: client?.source ?? "",
    address: client?.address ?? "",
    city: client?.city ?? "",
    state: client?.state ?? "",
    zip_code: client?.zip_code ?? "",
    date_of_birth: client?.date_of_birth ?? "",
    ssn_last_four: client?.ssn_last_four ?? "",
  });
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  const isEntity = ENTITY_TYPES.has(form.account_type);

  function toggleService(service: string) {
    setSelectedServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      client_type: deriveClientType(form.account_type),
      account_type: form.account_type,
      first_name: form.first_name,
      last_name: form.last_name,
      business_name: form.business_name,
      email: form.email,
      phone: form.phone,
      status: form.status,
      source: form.source,
      address: form.address,
      city: form.city,
      state: form.state,
      zip_code: form.zip_code,
      date_of_birth: form.date_of_birth || null,
      ssn_last_four: form.ssn_last_four.length === 4 ? form.ssn_last_four : null,
    };

    if (isEditing) {
      const { error } = await supabase.from("clients").update(payload).eq("id", client!.id);
      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      onSaved();
      onClose();
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!member) {
      setError("Could not determine your workspace. Contact your admin.");
      setSaving(false);
      return;
    }

    const { data: newClient, error } = await supabase
      .from("clients")
      .insert({
        workspace_id: member.workspace_id,
        ...payload,
        assigned_to: userId,
      })
      .select("id")
      .single();

    if (error) {
      setSaving(false);
      setError(error.message);
      return;
    }

    if (selectedServices.length > 0 && newClient) {
      const currentYear = new Date().getFullYear().toString();
      await supabase.from("services").insert(
        selectedServices.map((service_type) => ({
          workspace_id: member.workspace_id,
          client_id: newClient.id,
          service_type,
          service_status: "New",
          service_year: currentYear,
        }))
      );
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!client) return;
    const name = clientDisplayName(client);
    if (
      !window.confirm(
        `Delete ${name}? This removes the client record but not their services, tasks, or deadlines — remove those first if you want a clean delete.`
      )
    )
      return;
    setDeleting(true);
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    setDeleting(false);
    if (error) {
      setError(error.message);
      return;
    }
    onDeleted?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4 py-8">
      <div className="bg-white rounded-2xl border border-line shadow-lg w-full max-w-2xl max-h-full overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-slab text-lg font-bold text-ink">
            {isEditing ? "Edit Client" : "New Client"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-ink rounded-xl p-1.5 hover:bg-paper transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <Section label={isEntity ? "Entity" : "Name"}>
            {isEntity ? (
              <input
                required
                placeholder={ENTITY_NAME_LABEL[form.account_type]}
                value={form.business_name}
                onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                className="client-input w-full"
              />
            ) : (
              <div className="flex gap-2">
                <input
                  required
                  placeholder="First name"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  className="client-input w-1/2"
                />
                <input
                  required
                  placeholder="Last name"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  className="client-input w-1/2"
                />
              </div>
            )}
          </Section>

          <Section label="Contact">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="client-input w-full"
              />
              <input
                placeholder="Phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="client-input w-full"
              />
              <input
                placeholder="Referral source (e.g. Referral, Website, Google)"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className="client-input w-full sm:col-span-2"
              />
            </div>
          </Section>

          <Section label="Address">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                placeholder="Street address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="client-input w-full sm:col-span-2"
              />
              <input
                placeholder="City"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="client-input w-full"
              />
              <div className="flex gap-3">
                <input
                  placeholder="State"
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  className="client-input w-1/2"
                />
                <input
                  placeholder="ZIP code"
                  value={form.zip_code}
                  onChange={(e) => setForm({ ...form, zip_code: e.target.value })}
                  className="client-input w-1/2"
                />
              </div>
            </div>
          </Section>

          <Section label="Tax profile">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Account type</span>
                <select
                  value={form.account_type}
                  onChange={(e) => setForm({ ...form, account_type: e.target.value })}
                  className="client-input w-full"
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              {!isEntity && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted">Date of birth</span>
                    <input
                      type="date"
                      value={form.date_of_birth}
                      onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                      className="client-input w-full"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted">SSN (last 4)</span>
                    <input
                      maxLength={4}
                      placeholder="1234"
                      value={form.ssn_last_four}
                      onChange={(e) =>
                        setForm({ ...form, ssn_last_four: e.target.value.replace(/\D/g, "") })
                      }
                      className="client-input w-full"
                    />
                  </label>
                </>
              )}
            </div>
          </Section>

          {isEditing && (
            <Section label="Status">
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="client-input w-full"
              >
                <option value="lead">Lead</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </Section>
          )}

          {!isEditing && (
            <Section label="Services (optional)">
              <div className="grid gap-2 sm:grid-cols-2">
                {SERVICE_OPTIONS.map((service) => (
                  <label
                    key={service}
                    className="flex items-center gap-2 text-sm text-ink border border-line rounded-xl px-3 py-2.5 cursor-pointer hover:bg-paper"
                  >
                    <input
                      type="checkbox"
                      checked={selectedServices.includes(service)}
                      onChange={() => toggleService(service)}
                      className="w-4 h-4 accent-[#108A64]"
                    />
                    {service}
                  </label>
                ))}
              </div>
            </Section>
          )}

          {error && (
            <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-xl px-3 py-2.5">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {isEditing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="text-sm font-semibold py-2.5 px-3.5 rounded-xl border border-brick text-brick disabled:opacity-60 hover:bg-brick/5"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-sm font-semibold py-2.5 rounded-xl border border-line text-ink hover:bg-paper"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 text-sm font-semibold py-2.5 rounded-xl bg-[#108A64] text-white hover:bg-[#0d7555] disabled:opacity-60"
            >
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Create Client"}
            </button>
          </div>
        </form>
      </div>
      <style jsx global>{`
        .client-input {
          border: 1px solid #ddeae5;
          border-radius: 0.75rem;
          padding: 0.65rem 0.85rem;
          font-size: 0.875rem;
          background: #fff;
          outline: none;
        }
        .client-input:focus {
          border-color: #108a64;
          box-shadow: 0 0 0 3px rgba(16, 138, 100, 0.12);
        }
      `}</style>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{label}</div>
      {children}
    </div>
  );
}
