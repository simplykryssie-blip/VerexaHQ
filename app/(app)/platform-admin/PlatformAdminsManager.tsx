"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserMinus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

type Admin = { id: string; display_name: string | null };

export function PlatformAdminsManager({ admins, currentUserId }: { admins: Admin[]; currentUserId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  async function grant() {
    if (!email.trim()) return;
    setSaving(true);
    const { error } = await supabase.rpc("set_platform_admin", { p_user_email: email.trim(), p_is_platform_admin: true });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setEmail("");
    toast.show(`${email.trim()} is now a platform admin`, "success");
    router.refresh();
  }

  async function revoke(admin: Admin) {
    if (admin.id === currentUserId) {
      toast.show("You can't revoke your own platform admin access.", "error");
      return;
    }
    if (!window.confirm(`Remove platform admin access from ${admin.display_name ?? "this user"}?`)) return;
    setSaving(true);
    const { error } = await supabase.rpc("set_platform_admin_by_id", { p_user_id: admin.id, p_is_platform_admin: false });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Platform admin access removed", "success");
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
      <ul className="divide-y divide-border">
        {admins.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="text-slate">{a.display_name ?? a.id}</span>
            {a.id !== currentUserId && (
              <button type="button" onClick={() => revoke(a)} disabled={saving} className="text-muted hover:text-danger" aria-label="Revoke platform admin">
                <UserMinus size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
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
          Grant admin
        </button>
      </div>
    </div>
  );
}
