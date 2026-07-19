"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Client } from "@/lib/types";

const ACCOUNT_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "family", label: "Family" },
  { value: "business", label: "Business" },
  { value: "partnership", label: "Partnership" },
  { value: "trust", label: "Trust" },
  { value: "estate", label: "Estate" },
  { value: "nonprofit", label: "Nonprofit" },
];

const ENTITY_TYPES = new Set(["business", "partnership", "trust", "estate", "nonprofit"]);

const ENTITY_NAME_LABEL: Record<string, string> = {
  business: "Business name",
  partnership: "Partnership name",
  trust: "Trust name",
  estate: "Estate name",
  nonprofit: "Organization name",
};

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
    client_type: client?.client_type ?? "individual",
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

  const isEntity = ENTITY_TYPES.has(form.client_type);

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
      client_type: form.client_type,
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
      ssn_last_four: form.ssn_last_four,
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
    const name =
      client.client_type === "business" && client.business_name
        ? client.business_name
        : `${client.first_name} ${client.last_name}`.trim();
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
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4 py-8">
      <div className="bg-white rounded-sm border border-line w-full max-w-2xl max-h-full overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-slab text-lg font-bold text-ink">
            {isEditing ? "Edit Client" : "New Client"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-ink rounded-sm p-1 hover:bg-paper transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              Account type
            </div>
            <div className="flex flex-wrap gap-2">
              {ACCOUNT_TYPES.map((t) => (
                <button
                  type="button"
                  key={t.value}
                  onClick={() => setForm({ ...form, client_type: t.value })}
                  className="text-xs font-semibold py-2 px-3 rounded-sm border"
                  style={{
                    borderColor: form.client_type === t.value ? "#0D1B2A" : "#DDE3EC",
                    backgroundColor: form.client_type === t.value ? "#0D1B2A" : "white",
                    color: form.client_type === t.value ? "white" : "#0D1B2A",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {isEntity ? (
            <input
              required
              placeholder={ENTITY_NAME_LABEL[form.client_type]}
              value={form.business_name}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            />
          ) : (
            <div className="flex gap-2">
              <input
                required
                placeholder="First name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
              />
              <input
                required
                placeholder="Last name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
              />
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            />
            <input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <input
              placeholder="Referral source (e.g. Referral, Website, Google)"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm sm:col-span-2"
            />
            <input
              placeholder="Street address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm sm:col-span-2"
            />
            <input
              placeholder="City"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            />
            <input
              placeholder="State"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            />
            <input
              placeholder="ZIP code"
              value={form.zip_code}
              onChange={(e) => setForm({ ...form, zip_code: e.target.value })}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            />
          </div>

          {!isEntity && (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted uppercase tracking-wide">
                  Date of birth
                </span>
                <input
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted uppercase tracking-wide">
                  SSN (last 4)
                </span>
                <input
                  maxLength={4}
                  placeholder="1234"
                  value={form.ssn_last_four}
                  onChange={(e) =>
                    setForm({ ...form, ssn_last_four: e.target.value.replace(/\D/g, "") })
                  }
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}

          {isEditing && (
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            >
              <option value="lead">Lead</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          )}

          {!isEditing && (
            <div>
              <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                Services (optional)
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {SERVICE_OPTIONS.map((service) => (
                  <label
                    key={service}
                    className="flex items-center gap-2 text-sm text-ink border border-line rounded-sm px-3 py-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedServices.includes(service)}
                      onChange={() => toggleService(service)}
                      className="w-4 h-4 accent-[#0D1B2A]"
                    />
                    {service}
                  </label>
                ))}
              </div>
            </div>
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
                {deleting ? "Deleting…" : "Delete"}
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
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Create Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
