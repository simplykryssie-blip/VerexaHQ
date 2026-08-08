import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { isEmailConfigured, isSmsConfigured, isStripeConfigured } from "@/lib/providerStatus";
import { EmptyState } from "@/components/EmptyState";
import { ConnectStripeButton } from "@/components/settings/ConnectStripeButton";

export const dynamic = "force-dynamic";

const PROVIDERS = [
  { key: "email", label: "Resend (Email)", configured: isEmailConfigured },
  { key: "sms", label: "Twilio (SMS)", configured: isSmsConfigured },
  { key: "stripe", label: "Stripe (Payments)", configured: isStripeConfigured },
] as const;

const STATUS_STYLE: Record<string, string> = {
  healthy: "bg-green-100 text-green-700",
  degraded: "bg-amber-100 text-amber-700",
  down: "bg-danger/10 text-danger",
  unknown: "bg-surfaceMuted text-muted",
};

export default async function IntegrationsPage() {
  const workspace = await getCurrentWorkspace();
  const supabase = createClient();

  const { data: isAdmin } = workspace ? await supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }) : { data: false };

  if (!isAdmin) {
    return (
      <div className="max-w-2xl">
        <h2 className="text-base font-semibold text-ink">Integrations</h2>
        <div className="mt-6 rounded-xl border border-border bg-surface">
          <EmptyState message="Only workspace admins can view integration status." />
        </div>
      </div>
    );
  }

  const { data: health } = await supabase
    .from("provider_status")
    .select("provider, status, consecutive_failures, last_check_at, last_success_at, last_error");
  const byProvider = new Map((health ?? []).map((h) => [h.provider, h]));

  const { data: workspaceRow } = await supabase.from("workspaces").select("stripe_connect_status").eq("id", workspace!.id).single();

  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-semibold text-ink">Integrations</h2>
      <p className="mt-1 text-sm text-muted">
        Live status of the third-party providers Verexa sends through. &quot;Configured&quot; means credentials are set in the environment;
        the status badge reflects actual send/webhook health once something has gone through.
      </p>
      <div className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface">
        {PROVIDERS.map((p) => {
          const h = byProvider.get(p.key);
          const configured = p.configured();
          const status = h?.status ?? "unknown";
          return (
            <div key={p.key} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-ink">{p.label}</p>
                <p className="text-xs text-muted">
                  {configured ? "Credentials configured" : "Not configured -- set the required environment variables"}
                  {h?.last_success_at && ` -- last success ${new Date(h.last_success_at).toLocaleString()}`}
                  {h?.last_error && status !== "healthy" && ` -- ${h.last_error}`}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLE[status]}`}>{status}</span>
            </div>
          );
        })}
      </div>

      <h2 className="mt-8 text-base font-semibold text-ink">Stripe Connect</h2>
      <p className="mt-1 text-sm text-muted">
        Connect your firm&apos;s own Stripe account to accept client payments. Funds go straight to your account -- Verexa charges no
        platform fee on transactions.
      </p>
      <div className="mt-6 rounded-xl border border-border bg-surface">
        <ConnectStripeButton connectStatus={workspaceRow?.stripe_connect_status ?? "not_connected"} />
      </div>
    </div>
  );
}
