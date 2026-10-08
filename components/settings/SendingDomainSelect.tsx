"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

// Only matters for a workspace with more than one verified sending domain
// (ERO Office / Service Bureau multi-domain support) -- a single-domain
// workspace has nothing to choose between, so the caller only renders this
// when domains.length > 0. Lets a specific organizer template (e.g. a
// partner-recruiting brand distinct from the firm's own client-facing
// domain) route its emails through a domain other than the workspace's
// primary, without touching every other template's behavior.
export function SendingDomainSelect({
  table,
  id,
  domains,
  initialDomainId,
}: {
  table: "organizer_templates";
  id: string;
  domains: { id: string; domain: string }[];
  initialDomainId: string | null;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [domainId, setDomainId] = useState(initialDomainId ?? "");
  const [saving, setSaving] = useState(false);

  if (domains.length === 0) return null;

  async function handleChange(value: string) {
    setDomainId(value);
    setSaving(true);
    const { error } = await supabase
      .from(table)
      .update({ sending_domain_id: value || null })
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Sending domain updated", "success");
  }

  return (
    <label className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-slate">
      <Mail size={13} className="text-muted" aria-hidden="true" />
      Sending domain
      <select
        value={domainId}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
      >
        <option value="">Workspace default</option>
        {domains.map((d) => (
          <option key={d.id} value={d.id}>
            {d.domain}
          </option>
        ))}
      </select>
    </label>
  );
}
