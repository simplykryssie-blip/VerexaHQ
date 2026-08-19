import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Plug } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { ConnectStripeButton } from "@/components/settings/ConnectStripeButton";
import { ZoomConnectionCard } from "@/components/settings/ZoomConnectionCard";
import { CalendarConnectionCard } from "@/components/settings/CalendarConnectionCard";
import { JotFormConnectionCard } from "@/components/settings/JotFormConnectionCard";
import { EmailDomainCard, type DnsRecord } from "@/components/settings/EmailDomainCard";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: {
    zoom_error?: string;
    zoom_connected?: string;
    google_calendar_error?: string;
    microsoft_calendar_error?: string;
    calendar_connected?: string;
    stripe_error?: string;
    stripe_connected?: string;
  };
}) {
  const workspace = await getCurrentWorkspace();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: isAdmin } = workspace
    ? await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "settings.manage" })
    : { data: false };
  const { data: zoomConnection } = user
    ? await supabase.from("user_zoom_connections").select("status, zoom_email").eq("user_id", user.id).maybeSingle()
    : { data: null };
  const { data: calendarConnections } = user
    ? await supabase.from("user_calendar_connections").select("provider, status, external_account_email").eq("user_id", user.id)
    : { data: null };
  const googleConnection = calendarConnections?.find((c) => c.provider === "google");
  const microsoftConnection = calendarConnections?.find((c) => c.provider === "microsoft");

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

  const calendarSection = user && (
    <>
      <h2 className="mt-8 text-base font-semibold text-ink">Calendar</h2>
      <p className="mt-1 text-sm text-muted">
        Personal to you -- connect your own Google or Outlook calendar so your Verexa appointments show up on it, and so clients can&apos;t book
        you during something that&apos;s only on your personal calendar.
      </p>
      <div className="mt-6 space-y-3">
        <CalendarConnectionCard
          provider="google"
          label="Google Calendar"
          status={(googleConnection?.status as "connected" | "disconnected" | "revoked" | undefined) ?? "not_connected"}
          accountEmail={googleConnection?.external_account_email ?? null}
          error={searchParams.google_calendar_error ?? null}
        />
        <CalendarConnectionCard
          provider="microsoft"
          label="Outlook Calendar"
          status={(microsoftConnection?.status as "connected" | "disconnected" | "revoked" | undefined) ?? "not_connected"}
          accountEmail={microsoftConnection?.external_account_email ?? null}
          error={searchParams.microsoft_calendar_error ?? null}
        />
      </div>
    </>
  );

  if (!isAdmin) {
    return (
      <div className="max-w-2xl">
        <SettingsSectionHeader icon={Plug} title="Integrations" description="Connect the accounts you use personally -- everyone sees their own." />
        {calendarSection}
        {zoomSection}
      </div>
    );
  }

  const { data: workspaceRow } = await supabase.from("workspaces").select("stripe_connect_status").eq("id", workspace!.id).single();
  const { data: isJotformConnected } = await supabase.rpc("is_workspace_jotform_connected", { p_workspace_id: workspace!.id });
  const { data: emailDomain } = await supabase
    .from("workspace_email_domains")
    .select("domain, status, dns_records, from_local_part")
    .eq("workspace_id", workspace!.id)
    .maybeSingle();

  return (
    <div className="max-w-2xl">
      <SettingsSectionHeader
        icon={Plug}
        title="Integrations"
        description="Accounts your firm or you personally connect to Verexa. SMS sending is configured platform-wide and isn't shown here."
      />

      <h2 className="mt-2 text-base font-semibold text-ink">Stripe Connect</h2>
      <p className="mt-1 text-sm text-muted">
        Connect your firm&apos;s own Stripe account to accept client payments. Funds go straight to your account -- Verexa charges no
        platform fee on transactions.
      </p>
      {searchParams.stripe_connected && <p className="mt-2 text-sm text-success">Stripe connected.</p>}
      <div className="mt-6 rounded-2xl border border-border bg-surface shadow-soft">
        <ConnectStripeButton
          connectStatus={workspaceRow?.stripe_connect_status ?? "not_connected"}
          error={searchParams.stripe_error ?? null}
        />
      </div>

      <h2 className="mt-8 text-base font-semibold text-ink">Email</h2>
      <p className="mt-1 text-sm text-muted">
        Verify your own domain so emails to clients come from your firm instead of verexahq.com.
      </p>
      <div className="mt-6">
        <EmailDomainCard
          emailDomain={
            emailDomain
              ? {
                  domain: emailDomain.domain,
                  status: emailDomain.status as "pending" | "verified" | "failed",
                  dns_records: (emailDomain.dns_records as unknown as DnsRecord[]) ?? [],
                  from_local_part: emailDomain.from_local_part,
                }
              : null
          }
        />
      </div>

      <h2 className="mt-8 text-base font-semibold text-ink">JotForm</h2>
      <p className="mt-1 text-sm text-muted">Import your firm&apos;s existing JotForm forms as organizer templates.</p>
      <div className="mt-6">
        <JotFormConnectionCard workspaceId={workspace!.id} isConnected={Boolean(isJotformConnected)} />
      </div>

      {calendarSection}
      {zoomSection}
    </div>
  );
}
