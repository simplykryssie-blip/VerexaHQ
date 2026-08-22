"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

/** Records a service interest against an already-existing client -- the
 * New Client modal's Services picker only ever covers interest expressed
 * at intake; a lead can just as easily reveal interest in a service later
 * (a follow-up call, a portal message), and until this there was no way to
 * record that without re-running client creation. Fires the same
 * client.service_interest_selected automation trigger either way.
 *
 * Shows already-recorded services as checked and locked -- recording is
 * idempotent server-side regardless, but showing current state up front
 * means staff aren't guessing whether a click already "took" and re-clicking
 * out of doubt (each fire re-sends that service's organizer email). */
export function ServiceInterestControl({
  clientId,
  workspaceId,
  services,
  interestedServiceIds,
}: {
  clientId: string;
  workspaceId: string;
  services: { id: string; name: string }[];
  interestedServiceIds: string[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (services.length === 0) return null;

  async function addInterest(serviceId: string, serviceName: string) {
    if (interestedServiceIds.includes(serviceId) || savingId) return;
    setSavingId(serviceId);
    setError(null);
    const { error: rpcError } = await supabase.rpc("record_client_service_interest", {
      p_client_id: clientId,
      p_workspace_id: workspaceId,
      p_service_id: serviceId,
    });
    setSavingId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    toast.show(`Recorded interest in ${serviceName}`, "success");
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent"
      >
        <ClipboardList size={13} aria-hidden="true" /> Service interests
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-1 w-64 rounded-2xl border border-border bg-surface p-2 shadow-lg">
            <p className="px-2 pb-1.5 text-[11px] text-muted">Select a service this client has expressed interest in.</p>
            {services.map((s) => {
              const active = interestedServiceIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={active || savingId === s.id}
                  onClick={() => addInterest(s.id, s.name)}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition ${
                    active ? "text-accent" : "text-slate hover:bg-surfaceMuted disabled:opacity-60"
                  }`}
                >
                  <span>{s.name}</span>
                  {active && <Check size={13} aria-hidden="true" />}
                </button>
              );
            })}
            {error && <p className="px-2 pt-1 text-[11px] text-danger">{error}</p>}
          </div>
        </>
      )}
    </div>
  );
}
