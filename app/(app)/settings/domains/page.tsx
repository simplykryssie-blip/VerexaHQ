import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Globe } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { DomainPortabilitySettings, type PortableEmailDomain, type PortableWebsiteDomain } from "@/components/settings/DomainPortabilitySettings";

export const dynamic = "force-dynamic";

// Reachable regardless of workspace operational status (see
// SUSPENSION_ALLOWED_PATH_PREFIXES in lib/workspace.ts) -- a customer-owned
// domain must stay self-service releasable here even when this workspace
// can't pay, or leaving Verexa ends up requiring Verexa's own support to
// release it. Deliberately read-only/release-only: connecting a NEW domain
// stays on /settings/integrations (email) and the website's own settings
// (website custom domain), both of which correctly keep requiring an
// operational workspace.
export default async function DomainsSettingsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: canManageSettings }, { data: canManageSites }] = await Promise.all([
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "settings.manage" }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "site_pages.manage" }),
  ]);

  if (!canManageSettings && !canManageSites) {
    return (
      <div className="max-w-2xl">
        <SettingsSectionHeader icon={Globe} title="Domains" description="Customer-owned domains connected to this workspace." />
        <p className="mt-4 text-sm text-muted">You don&apos;t have permission to manage this workspace&apos;s domains. Ask an admin.</p>
      </div>
    );
  }

  const [{ data: emailDomainRows }, { data: websiteRows }] = await Promise.all([
    canManageSettings
      ? supabase
          .from("workspace_email_domains")
          .select("id, domain, status")
          .eq("workspace_id", workspace.id)
          .is("released_at", null)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as { id: string; domain: string; status: string }[] }),
    canManageSites
      ? supabase
          .from("site_websites")
          .select("id, name, custom_domain, domain_verified")
          .eq("workspace_id", workspace.id)
          .not("custom_domain", "is", null)
      : Promise.resolve({ data: [] as { id: string; name: string; custom_domain: string | null; domain_verified: boolean }[] }),
  ]);

  const emailDomains: PortableEmailDomain[] = (emailDomainRows ?? []).map((d) => ({
    id: d.id,
    domain: d.domain,
    status: d.status as "pending" | "verified" | "failed",
  }));

  const websiteDomains: PortableWebsiteDomain[] = (websiteRows ?? [])
    .filter((w) => Boolean(w.custom_domain))
    .map((w) => ({
      websiteId: w.id,
      websiteName: w.name,
      domain: w.custom_domain as string,
      verified: w.domain_verified,
    }));

  return (
    <div className="max-w-2xl">
      <SettingsSectionHeader
        icon={Globe}
        title="Domains"
        description="Customer-owned domains connected to this workspace. Disconnecting here doesn't delete the domain -- it's yours, registered at your own registrar -- it only releases Verexa's own configuration for it, so you're free to point it anywhere else."
      />
      <div className="mt-6">
        <DomainPortabilitySettings emailDomains={emailDomains} websiteDomains={websiteDomains} />
      </div>
    </div>
  );
}
