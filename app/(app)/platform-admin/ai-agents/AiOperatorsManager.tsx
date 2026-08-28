"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserMinus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

type AiOperator = { id: string; display_name: string | null };

// Mirrors PlatformItManager.tsx exactly (grant by email, revoke by id) --
// is_platform_ai_operator is the same shape of narrower, delegable platform
// flag as is_platform_it, just scoped to Admin AI instead of system tools.
export function AiOperatorsManager({ operators }: { operators: AiOperator[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  async function grant() {
    if (!email.trim()) return;
    setSaving(true);
    const { error } = await supabase.rpc("set_platform_ai_operator", { p_user_email: email.trim(), p_is_platform_ai_operator: true });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setEmail("");
    toast.show(`${email.trim()} now has Admin AI access`, "success");
    router.refresh();
  }

  async function revoke(operator: AiOperator) {
    if (!window.confirm(`Remove Admin AI access from ${operator.display_name ?? "this user"}?`)) return;
    setSaving(true);
    const { error } = await supabase.rpc("set_platform_ai_operator_by_id", { p_user_id: operator.id, p_is_platform_ai_operator: false });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Admin AI access removed", "success");
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
      {operators.length === 0 ? (
        <p className="text-sm text-muted">Nobody has been delegated Admin AI access yet -- platform admins always have it.</p>
      ) : (
        <ul className="divide-y divide-border">
          {operators.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-slate">{u.display_name ?? u.id}</span>
              <button type="button" onClick={() => revoke(u)} disabled={saving} className="text-muted hover:text-danger" aria-label="Revoke Admin AI access">
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
          Grant Admin AI access
        </button>
      </div>
    </div>
  );
}
