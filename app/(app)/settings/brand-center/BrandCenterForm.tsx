"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Branding = {
  display_name: string | null;
  dba: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  support_email: string | null;
  support_phone: string | null;
} | null;

export function BrandCenterForm({ workspaceId, branding }: { workspaceId: string; branding: Branding }) {
  const router = useRouter();
  const supabase = createClient();
  const [displayName, setDisplayName] = useState(branding?.display_name ?? "");
  const [supportEmail, setSupportEmail] = useState(branding?.support_email ?? "");
  const [primaryColor, setPrimaryColor] = useState(branding?.primary_color ?? "#2563EB");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const { error } = await supabase
      .from("branding")
      .update({
        display_name: displayName || null,
        support_email: supportEmail || null,
        primary_color: primaryColor,
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
      <div>
        <label className="block text-sm font-medium text-slate">Display name</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate">Support email</label>
        <input
          type="email"
          value={supportEmail}
          onChange={(e) => setSupportEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate">Primary color</label>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="color"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="h-9 w-14 rounded border border-border"
          />
          <span className="text-sm text-muted">{primaryColor}</span>
        </div>
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
