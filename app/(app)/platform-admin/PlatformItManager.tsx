"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserMinus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

type ItUser = { id: string; display_name: string | null };

export function PlatformItManager({ itUsers }: { itUsers: ItUser[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  async function grant() {
    if (!email.trim()) return;
    setSaving(true);
    const { error } = await supabase.rpc("set_platform_it", { p_user_email: email.trim(), p_is_platform_it: true });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setEmail("");
    toast.show(`${email.trim()} now has IT tools access`, "success");
    router.refresh();
  }

  async function revoke(itUser: ItUser) {
    if (!window.confirm(`Remove IT tools access from ${itUser.display_name ?? "this user"}?`)) return;
    setSaving(true);
    const { error } = await supabase.rpc("set_platform_it_by_id", { p_user_id: itUser.id, p_is_platform_it: false });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("IT tools access removed", "success");
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
      {itUsers.length === 0 ? (
        <p className="text-sm text-muted">Nobody has IT tools access yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {itUsers.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-slate">{u.display_name ?? u.id}</span>
              <button type="button" onClick={() => revoke(u)} disabled={saving} className="text-muted hover:text-danger" aria-label="Revoke IT tools access">
                <UserMinus size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@address.com"
          className="flex-1 rounded-lg border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="button"
          onClick={grant}
          disabled={saving}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          Grant IT access
        </button>
      </div>
    </div>
  );
}
