"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";
import { useToast } from "@/components/Toast";

export type FixedService = { id: string; name: string; description: string | null };
export type OwnedService = { id: string; name: string; status: string; cloned_from_service_id: string | null };

function FixedServiceRow({
  fixed,
  owned,
  workspaceId,
}: {
  fixed: FixedService;
  owned: OwnedService | undefined;
  workspaceId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const enabled = Boolean(owned);

  async function turnOn() {
    setBusy(true);
    const { error } = await supabase.rpc("turn_on_service", {
      p_service_id: fixed.id,
      p_workspace_id: workspaceId,
    });
    setBusy(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Service turned on", "success");
    router.refresh();
  }

  async function turnOff() {
    if (!owned) return;
    setBusy(true);
    const { count } = await supabase.from("engagements").select("id", { count: "exact", head: true }).eq("service_id", owned.id);
    if ((count ?? 0) > 0) {
      setBusy(false);
      toast.show(
        `"${owned.name}" has ${count} existing engagement${count === 1 ? "" : "s"} and can't be turned off -- open it and archive it from the status control instead.`,
        "error"
      );
      return;
    }
    if (!window.confirm(`Turn off "${fixed.name}"? Your customized pipeline for it will be deleted.`)) {
      setBusy(false);
      return;
    }
    const { error } = await supabase.from("services").delete().eq("id", owned.id);
    setBusy(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Service turned off", "success");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <div className="min-w-0">
        {enabled && owned ? (
          <>
            <Link href={`/settings/services/${owned.id}`} className="text-sm font-medium text-accent hover:underline">
              {fixed.name}
            </Link>
            {fixed.description && <p className="mt-0.5 text-xs text-muted">{fixed.description}</p>}
            <Link href={`/settings/services/${owned.id}`} className="mt-0.5 block text-xs text-muted hover:text-accent hover:underline">
              Manage its pipeline
            </Link>
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-ink">{fixed.name}</span>
            {fixed.description && <p className="mt-0.5 text-xs text-muted">{fixed.description}</p>}
          </>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={enabled ? turnOff : turnOn}
        disabled={busy}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition disabled:opacity-60 ${enabled ? "border-accent bg-accent" : "border-border bg-border"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${enabled ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

function CustomServiceRow({ service }: { service: OwnedService }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

  async function deleteService() {
    setDeleting(true);
    const { count } = await supabase.from("engagements").select("id", { count: "exact", head: true }).eq("service_id", service.id);
    if ((count ?? 0) > 0) {
      setDeleting(false);
      toast.show(
        `"${service.name}" has ${count} existing engagement${count === 1 ? "" : "s"} and can't be deleted -- open it and archive it from the status control instead.`,
        "error"
      );
      return;
    }
    if (!window.confirm(`Delete "${service.name}"? This can't be undone.`)) {
      setDeleting(false);
      return;
    }
    const { error } = await supabase.from("services").delete().eq("id", service.id);
    setDeleting(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Service deleted", "success");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <div>
        <Link href={`/settings/services/${service.id}`} className="text-sm font-medium text-accent hover:underline">
          {service.name}
        </Link>
        <p className="text-xs capitalize text-muted">{service.status}</p>
      </div>
      <button type="button" onClick={deleteService} disabled={deleting} className="text-muted hover:text-danger disabled:opacity-60" aria-label="Delete">
        <Trash2 size={16} />
      </button>
    </div>
  );
}

export function ServiceToggleList({
  workspaceId,
  fixedServices,
  ownedServices,
  templateServiceId,
}: {
  workspaceId: string;
  fixedServices: FixedService[];
  ownedServices: OwnedService[];
  templateServiceId: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [adding, setAdding] = useState(false);

  const ownedByFixedId = new Map(ownedServices.filter((s) => s.cloned_from_service_id).map((s) => [s.cloned_from_service_id as string, s]));
  const customServices = ownedServices.filter((s) => !s.cloned_from_service_id);

  return (
    <div>
      <div className="space-y-2">
        {fixedServices.map((fixed) => (
          <FixedServiceRow key={fixed.id} fixed={fixed} owned={ownedByFixedId.get(fixed.id)} workspaceId={workspaceId} />
        ))}
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Your custom services</h3>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            <Plus size={14} /> Add custom service
          </button>
        </div>

        {adding && (
          <div className="mt-3">
            <InlineAddForm
              label="New service"
              defaultOpen
              fields={[{ name: "name", label: "Name", required: true }]}
              onSubmit={async (v) => {
                if (!templateServiceId) return "No starter pipeline is available to base this on -- try again shortly.";
                const { data, error } = await supabase.rpc("turn_on_service", {
                  p_service_id: templateServiceId,
                  p_workspace_id: workspaceId,
                  p_new_name: v.name,
                });
                if (error) return error.message;
                setAdding(false);
                router.push(`/settings/services/${data as string}`);
              }}
            />
          </div>
        )}

        <div className="mt-3 space-y-2">
          {customServices.length === 0 && !adding && <p className="text-sm text-muted">No custom services yet.</p>}
          {customServices.map((s) => (
            <CustomServiceRow key={s.id} service={s} />
          ))}
        </div>
      </div>
    </div>
  );
}
