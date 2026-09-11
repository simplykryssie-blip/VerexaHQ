"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Copy, Trash2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { PasswordInput } from "@/components/PasswordInput";

type Credential = { id: string; system_name: string; username: string | null; notes: string | null; updated_at: string };

const EMPTY_FORM = { id: null as string | null, systemName: "", username: "", secret: "", notes: "" };

export function SystemCredentialsManager({ credentials }: { credentials: Credential[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);

  function startEdit(c: Credential) {
    setForm({ id: c.id, systemName: c.system_name, username: c.username ?? "", secret: "", notes: c.notes ?? "" });
    setAdding(true);
  }

  async function save() {
    if (!form.systemName.trim() || (!form.id && !form.secret.trim())) return;
    setSaving(true);
    // Codegen types every RPC arg as required even though the SQL function
    // accepts nulls (p_id null = insert; blank username/secret/notes are
    // nullif()'d to NULL server-side) -- the cast reflects that, not a type
    // mismatch.
    const { error } = await supabase.rpc("set_platform_system_credential", {
      p_id: form.id as unknown as string,
      p_system_name: form.systemName.trim(),
      p_username: form.username.trim(),
      p_secret: form.secret.trim(),
      p_notes: form.notes.trim(),
    });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setForm(EMPTY_FORM);
    setAdding(false);
    toast.show(form.id ? "Credential updated" : "Credential saved", "success");
    router.refresh();
  }

  async function remove(c: Credential) {
    if (!window.confirm(`Delete the stored credential for ${c.system_name}?`)) return;
    const { error } = await supabase.rpc("delete_platform_system_credential", { p_id: c.id });
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[c.id];
      return next;
    });
    toast.show("Credential deleted", "success");
    router.refresh();
  }

  async function reveal(c: Credential) {
    if (revealed[c.id]) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[c.id];
        return next;
      });
      return;
    }
    setRevealing(c.id);
    const { data, error } = await supabase.rpc("get_platform_system_credential_secret", { p_id: c.id });
    setRevealing(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setRevealed((prev) => ({ ...prev, [c.id]: data ?? "" }));
  }

  async function copy(secret: string) {
    await navigator.clipboard.writeText(secret);
    toast.show("Copied to clipboard", "success");
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft">
      {credentials.length === 0 ? (
        <p className="p-5 text-sm text-muted">No credentials stored yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {credentials.map((c) => (
            <li key={c.id} className="px-5 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <button type="button" onClick={() => startEdit(c)} className="font-medium text-ink hover:text-accent">
                    {c.system_name}
                  </button>
                  {c.username && <span className="ml-2 text-muted">{c.username}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => reveal(c)}
                    disabled={revealing === c.id}
                    className="text-muted hover:text-ink"
                    aria-label={revealed[c.id] ? "Hide password" : "Show password"}
                  >
                    {revealed[c.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  {revealed[c.id] && (
                    <button type="button" onClick={() => copy(revealed[c.id])} className="text-muted hover:text-ink" aria-label="Copy password">
                      <Copy size={14} />
                    </button>
                  )}
                  <button type="button" onClick={() => remove(c)} className="text-muted hover:text-danger" aria-label="Delete credential">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {revealed[c.id] !== undefined && <p className="mt-1 break-all font-mono text-xs text-slate">{revealed[c.id] || "(empty)"}</p>}
              {c.notes && <p className="mt-1 text-xs text-muted">{c.notes}</p>}
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-border p-4">
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent"
          >
            <Plus size={14} /> Add credential
          </button>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={form.systemName}
                onChange={(e) => setForm((f) => ({ ...f, systemName: e.target.value }))}
                placeholder="System (e.g. Stripe, Resend)"
                className="rounded-lg border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="Username / login"
                className="rounded-lg border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <PasswordInput
              value={form.secret}
              onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
              placeholder={form.id ? "New password (leave blank to keep current)" : "Password"}
              className="w-full rounded-lg border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Notes (optional)"
              className="w-full rounded-lg border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setAdding(false);
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:bg-surfaceMuted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
