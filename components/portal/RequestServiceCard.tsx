"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/Badge";

type ServiceCategory = { id: string; name: string; services: { id: string; name: string }[] };

// Additive only -- this never lets a client unselect or replace a service
// they already have on file (submit_portal_basic_info handles that during
// onboarding, propose_client_contact_field-style approval flows are a
// separate concern). It just offers whatever they haven't already asked
// for, so requesting one here can't override a choice made elsewhere.
export function RequestServiceCard({ requestedServiceIds }: { requestedServiceIds: string[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [justRequested, setJustRequested] = useState<string[]>([]);

  useEffect(() => {
    supabase.rpc("get_portal_service_options").then(({ data }) => {
      setCategories((data as unknown as ServiceCategory[] | null) ?? []);
      setLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flat, matching the same "services are basic now" convention as the
  // onboarding picker in BasicInfoForm.
  const services = categories.flatMap((c) => c.services);
  const requestedSet = new Set([...requestedServiceIds, ...justRequested]);

  async function request(id: string) {
    setRequestingId(id);
    const { error } = await supabase.rpc("request_portal_service", { p_service_id: id });
    setRequestingId(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setJustRequested((prev) => [...prev, id]);
    toast.show("Request sent -- your firm has been notified.", "success");
    router.refresh();
  }

  if (!loaded || services.length === 0) return null;

  return (
    <div className="max-w-md rounded-2xl border border-border bg-surface shadow-soft p-4">
      <h2 className="text-sm font-semibold text-ink">Request another service</h2>
      <p className="mt-1 text-sm text-muted">Need help with something else? Let your firm know -- this won&apos;t change anything already on file.</p>
      <div className="mt-4 space-y-2">
        {services.map((s) => {
          const requested = requestedSet.has(s.id);
          return (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-sm text-slate">{s.name}</span>
              {requested ? (
                <Badge tone="success">Requested</Badge>
              ) : (
                <button
                  type="button"
                  onClick={() => request(s.id)}
                  disabled={requestingId === s.id}
                  className="text-xs font-medium text-accent hover:underline disabled:opacity-60"
                >
                  {requestingId === s.id ? "Requesting..." : "Request"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
