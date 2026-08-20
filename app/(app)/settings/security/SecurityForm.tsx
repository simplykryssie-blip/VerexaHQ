"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";

type Policy = Database["public"]["Tables"]["workspace_security_policies"]["Row"];

export function SecurityForm({ workspaceId, policy }: { workspaceId: string; policy: Policy }) {
  const router = useRouter();
  const supabase = createClient();
  const [mfaRequired, setMfaRequired] = useState(policy.mfa_required);
  const [sessionTimeout, setSessionTimeout] = useState(policy.session_timeout_minutes);
  const [passwordMinLength, setPasswordMinLength] = useState(policy.password_min_length);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const { error } = await supabase
      .from("workspace_security_policies")
      .update({
        mfa_required: mfaRequired,
        session_timeout_minutes: sessionTimeout,
        password_min_length: passwordMinLength,
      })
      .eq("workspace_id", workspaceId);

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="flex items-center gap-3 text-sm text-slate">
        <input
          type="checkbox"
          checked={mfaRequired}
          onChange={(e) => setMfaRequired(e.target.checked)}
          className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
        />
        Require multi-factor authentication for all users
      </label>

      <div>
        <label className="block text-sm font-medium text-slate">Session timeout (minutes)</label>
        <input
          type="number"
          min={5}
          value={sessionTimeout}
          onChange={(e) => setSessionTimeout(Number(e.target.value))}
          className="mt-1 w-32 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate">Minimum password length</label>
        <input
          type="number"
          min={6}
          value={passwordMinLength}
          onChange={(e) => setPasswordMinLength(Number(e.target.value))}
          className="mt-1 w-32 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && !error && <p className="text-sm text-success">Saved.</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}
