"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client } from "@/lib/types";

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
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (isEditing) {
      const { error } = await supabase
        .from("clients")
        .update({
          client_type: form.client_type,
          first_name: form.first_name,
          last_name: form.last_name,
          business_name: form.business_name,
          email: form.email,
          phone: form.phone,
          status: form.status,
        })
        .eq("id", client!.id);
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

    const { error } = await supabase.from("clients").insert({
      workspace_id: member.workspace_id,
      client_type: form.client_type,
      first_name: form.first_name,
      last_name: form.last_name,
      business_name: form.business_name,
      email: form.email,
      phone: form.phone,
      status: form.status,
      assigned_to: userId,
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
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-md p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">
          {isEditing ? "Edit Client" : "New Client"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            {["individual", "business", "family"].map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setForm({ ...form, client_type: t })}
                className="flex-1 text-xs font-semibold py-2 rounded-sm border capitalize"
                style={{
                  borderColor: form.client_type === t ? "#0D1B2A" : "#DDE3EC",
                  backgroundColor: form.client_type === t ? "#0D1B2A" : "white",
                  color: form.client_type === t ? "white" : "#0D1B2A",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {form.client_type === "business" ? (
            <input
              required
              placeholder="Business name"
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
