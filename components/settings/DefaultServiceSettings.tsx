"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Option = { id: string; name: string };

// "How do we automatically attach a new client to a service package?" --
// this is the answer: a per-workspace default, by client type, that the New
// Client form pre-selects so staff don't have to remember to check one
// every time. Staff can still change or clear the selection per client.
export function DefaultServiceSettings({
  workspaceId,
  services,
  defaultIndividualServiceId,
  defaultBusinessServiceId,
}: {
  workspaceId: string;
  services: Option[];
  defaultIndividualServiceId: string | null;
  defaultBusinessServiceId: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [individualId, setIndividualId] = useState(defaultIndividualServiceId ?? "");
  const [businessId, setBusinessId] = useState(defaultBusinessServiceId ?? "");
  const [saving, setSaving] = useState<"individual" | "business" | null>(null);

  async function save(field: "default_individual_service_id" | "default_business_service_id", value: string, key: "individual" | "business") {
    setSaving(key);
    const update =
      field === "default_individual_service_id" ? { default_individual_service_id: value || null } : { default_business_service_id: value || null };
    await supabase.from("workspaces").update(update).eq("id", workspaceId);
    setSaving(null);
    router.refresh();
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">Default service for new clients</h3>
      <p className="mt-1 text-xs text-muted">
        Pre-selects a service on the New Client form based on whether the client is an individual or a business, so it doesn&apos;t have to be
        picked by hand every time. Staff can still change it per client.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Individual clients
          <select
            value={individualId}
            onChange={(e) => {
              setIndividualId(e.target.value);
              save("default_individual_service_id", e.target.value, "individual");
            }}
            disabled={saving === "individual"}
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          >
            <option value="">None</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Business clients
          <select
            value={businessId}
            onChange={(e) => {
              setBusinessId(e.target.value);
              save("default_business_service_id", e.target.value, "business");
            }}
            disabled={saving === "business"}
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          >
            <option value="">None</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
