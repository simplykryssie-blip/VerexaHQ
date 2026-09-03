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
  const [pendingInvite, setPendingInvite] = useState<{ email: string; acceptUrl: string } | null>(null);

  async function grant() {
    if (!email.trim()) return;
    setSaving(true);
    setPendingInvite(null);

    // Someone who's never logged into VerexaHQ has no auth.users row to flip
    // a flag on, so this can't just be an RPC call anymore -- it goes through
    // a route that emails a real invite (join Verexa's home workspace,
    // granting IT access on acceptance) whenever the email doesn't exist yet.
    const res = await fetch("/api/platform-it-invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);

    if (!res.ok) {
      toast.show(data?.error ?? "Could not grant IT access", "error");
      return;
    }

    const sentEmail = email.trim();
    setEmail("");

    if (data.granted) {
      toast.show(`${sentEmail} now has IT tools access`, "success");
      router.refresh();
      return;
    }

    if (data.email?.sent) {
      toast.show(`Invitation emailed to ${sentEmail}`, "success");
    } else {
      setPendingInvite({ email: sentEmail, acceptUrl: data.acceptUrl });
    }
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
      {pendingInvite && (
        <div className="mt-3 rounded-lg bg-surfaceMuted p-3 text-sm text-slate">
          <p>
            Invitation created for {pendingInvite.email}, but email delivery isn&apos;t configured yet -- share this link
            with them directly:
          </p>
          <p className="mt-1 break-all font-mono text-xs text-accent">{pendingInvite.acceptUrl}</p>
        </div>
      )}
    </div>
  );
}
