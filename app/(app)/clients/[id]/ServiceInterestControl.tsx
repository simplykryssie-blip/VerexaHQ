"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

/** Records a service interest against an already-existing client -- the
 * New Client modal's Services picker only ever covers interest expressed
 * at intake; a lead can just as easily reveal interest in a service later
 * (a follow-up call, a portal message), and until this there was no way to
 * record that without re-running client creation. Fires the same
 * client.service_interest_selected automation trigger either way. */
export function ServiceInterestControl({
  clientId,
  workspaceId,
  services,
}: {
  clientId: string;
  workspaceId: string;
  services: { id: string; name: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (services.length === 0) return null;

  async function addInterest(serviceId: string) {
    if (!serviceId) return;
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("record_client_service_interest", {
      p_client_id: clientId,
      p_workspace_id: workspaceId,
      p_service_id: serviceId,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    toast.show("Service interest recorded", "success");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value=""
        onChange={(e) => addInterest(e.target.value)}
        disabled={saving}
        className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-slate focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
      >
        <option value="" disabled>
          Add service interest
        </option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
