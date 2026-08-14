import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Plug } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { ConnectStripeButton } from "@/components/settings/ConnectStripeButton";
import { ZoomConnectionCard } from "@/components/settings/ZoomConnectionCard";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: { zoom_error?: string; zoom_connected?: string; stripe_error?: string; stripe_connected?: string };
}) {
  const workspace = await getCurrentWorkspace();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: isAdmin } = workspace ? await supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }) : { data: false };
  const { data: zoomConnection } = user
    ? await supabase.from("user_zoom_connections").select("status, zoom_email").eq("user_id", user.id).maybeSingle()
    : { data: null };

  const zoomSection = user && (
    <>
      <h2 className="mt-8 text-base font-semibold text-ink">Zoom</h2>
      <p className="mt-1 text-sm text-muted">
        Personal to you -- each staff member connects their own Zoom account to create meetings for their own appointments.
      </p>
      <div className="mt-6">
        <ZoomConnectionCard
          status={(zoomConnection?.status as "connected" | "disconnected" | "revoked" | undefined) ?? "not_connected"}
          zoomEmail={zoomConnection?.zoom_email ?? null}
          error={searchParams.zoom_error ?? null}
        />
      </div>
    </>
  );

  if (!isAdmin) {
    return (
      <div className="max-w-2xl">
        <SettingsSectionHeader icon={Plug} title="Integrations" description="Connect the accounts you use personally -- everyone sees their own." />
        {zoomSection}
      </div>
    );
  }

  const { data: workspaceRow } = await supabase.from("workspaces").select("stripe_connect_status").eq("id", workspace!.id).single();

  return (
    <div className="max-w-2xl">
      <SettingsSectionHeader
        icon={Plug}
        title="Integrations"
        description="Accounts your firm or you personally connect to Verexa. Email and SMS sending are configured platform-wide and aren't shown here."
      />

      <h2 className="mt-2 text-base font-semibold text-ink">Stripe Connect</h2>
      <p className="mt-1 text-sm text-muted">
        Connect your firm&apos;s own Stripe account to accept client payments. Funds go straight to your account -- Verexa charges no
        platform fee on transactions.
      </p>
      {searchParams.stripe_connected && <p className="mt-2 text-sm text-success">Stripe connected.</p>}
      <div className="mt-6 rounded-xl border border-border bg-surface">
        <ConnectStripeButton
          connectStatus={workspaceRow?.stripe_connect_status ?? "not_connected"}
          error={searchParams.stripe_error ?? null}
        />
      </div>

      {zoomSection}
    </div>
  );
}
