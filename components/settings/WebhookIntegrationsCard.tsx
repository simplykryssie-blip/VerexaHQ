"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/Confirm";
import { Badge } from "@/components/ui/Badge";

export type WebhookIntegrationRow = {
  id: string;
  provider: string;
  name: string;
  status: string;
  last_event_at: string | null;
};

const PROVIDER_LABELS: Record<string, string> = { generic: "Generic (HMAC-signed)", stripe: "Stripe" };

// Every secret this card ever shows came back from create/rotate's own RPC
// call, in-memory, this render only -- signing_secret is never selectable
// via a normal query (column-level grant on webhook_integrations excludes
// it), so there is no "load and redisplay" path to accidentally build.
export function WebhookIntegrationsCard({ workspaceId, integrations }: { workspaceId: string; integrations: WebhookIntegrationRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("generic");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<{ id: string; secret: string } | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.show("Name this integration first.", "error");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase
      .rpc("create_webhook_integration", { p_workspace_id: workspaceId, p_provider: provider, p_name: name.trim() })
      .single();
    setCreating(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setName("");
    setRevealedSecret({ id: data!.id, secret: data!.signing_secret });
    router.refresh();
  }

  async function rotate(id: string) {
    const ok = await confirm({
      title: "Rotate signing secret?",
      body: "The old secret stops working immediately. You'll need to update it wherever this integration is configured.",
      confirmLabel: "Rotate secret",
    });
    if (!ok) return;
    setBusyId(id);
    const { data, error } = await supabase.rpc("rotate_webhook_integration_secret", { p_integration_id: id });
    setBusyId(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setRevealedSecret({ id, secret: data as string });
  }

  async function toggleStatus(id: string, currentStatus: string) {
    const nextStatus = currentStatus === "active" ? "disabled" : "active";
    setBusyId(id);
    const { error } = await supabase.from("webhook_integrations").update({ status: nextStatus }).eq("id", id);
    setBusyId(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show(nextStatus === "active" ? "Integration enabled" : "Integration disabled", "success");
    router.refresh();
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: "Delete this webhook integration?",
      body: "Any workflow trigger or wait condition configured against it will stop matching new events.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setBusyId(id);
    const { error } = await supabase.from("webhook_integrations").delete().eq("id", id);
    setBusyId(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Integration deleted", "success");
    router.refresh();
  }

  const endpointUrl = (id: string) => (typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/${id}` : `/api/webhooks/${id}`);

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-5">
      <p className="text-sm font-medium text-ink">Webhook integrations</p>
      <p className="mt-1 text-xs text-muted">
        Signature-verified endpoints external systems (or your own Stripe account) can POST events to, to start or resume a workflow.
        Use the <code>webhook.received</code> trigger or the &quot;A webhook event was received&quot; wait condition to react to one.
      </p>

      {integrations.length > 0 && (
        <ul className="mt-4 space-y-2">
          {integrations.map((i) => (
            <li key={i.id} className="rounded-xl border border-border bg-surfaceMuted/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{i.name}</p>
                  <p className="text-xs text-muted">
                    {PROVIDER_LABELS[i.provider] ?? i.provider}
                    {i.last_event_at ? ` · last event ${new Date(i.last_event_at).toLocaleString()}` : " · no events yet"}
                  </p>
                </div>
                <Badge tone={i.status === "active" ? "success" : "neutral"}>{i.status === "active" ? "Active" : "Disabled"}</Badge>
              </div>
              <p className="mt-2 truncate rounded-lg bg-surface px-2 py-1 font-mono text-[11px] text-muted">{endpointUrl(i.id)}</p>
              {revealedSecret?.id === i.id && (
                <p className="mt-2 rounded-lg border border-warning/30 bg-warning/5 px-2 py-1.5 text-[11px] text-ink">
                  Signing secret (shown once -- copy it now): <span className="font-mono">{revealedSecret.secret}</span>
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === i.id}
                  onClick={() => rotate(i.id)}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-ink hover:bg-surfaceMuted disabled:opacity-60"
                >
                  Rotate secret
                </button>
                <button
                  type="button"
                  disabled={busyId === i.id}
                  onClick={() => toggleStatus(i.id, i.status)}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-ink hover:bg-surfaceMuted disabled:opacity-60"
                >
                  {i.status === "active" ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  disabled={busyId === i.id}
                  onClick={() => remove(i.id)}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/5 disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={create} className="mt-4 flex flex-wrap items-start gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. 'My Stripe account')"
          className="min-w-[180px] flex-1 rounded-lg border border-border px-3 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="generic">Generic (HMAC-signed)</option>
          <option value="stripe">Stripe</option>
        </select>
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {creating ? "Creating..." : "Add integration"}
        </button>
      </form>
    </div>
  );
}
