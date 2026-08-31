import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { PartnerCard } from "./PartnerCard";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, BadgeTone> = {
  active: "success",
  pending: "warning",
  revoked: "danger",
};

export default async function PartnersPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: isAdmin } = await supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id });

  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Partners" description="Contact and business info for the PTINs connected to your firm." />
        <div className="flex-1 px-8 py-6">
          <EmptyState message="Only a workspace admin can view connected partners." />
        </div>
      </>
    );
  }

  const { data: partners, error } = await supabase.rpc("get_ero_connected_partners", { p_workspace_id: workspace.id });

  return (
    <>
      <PageHeader
        title="Partners"
        description="Contact and business info for the PTINs connected to your firm -- separate from your client Contacts. Manage the connection itself (billing, branding, disconnect) in Settings > Connections."
        actions={
          <Link href="/settings/connections" className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent">
            Manage connections
          </Link>
        }
      />
      <div className="flex-1 px-8 py-6">
        {error ? (
          <EmptyState message="Could not load connected partners." />
        ) : (partners ?? []).length === 0 ? (
          <EmptyState message="No PTINs connected yet. Generate an invite from Settings > Connections to add one." />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {(partners ?? []).map((p) => (
              <PartnerCard
                key={p.connection_id}
                connectionId={p.connection_id}
                name={p.name}
                statusBadge={<Badge tone={STATUS_TONE[p.status] ?? "neutral"} className="capitalize">{p.status}</Badge>}
                phone={p.phone}
                email={p.primary_contact_email}
                website={p.website}
                mailingAddress={p.mailing_address}
                initialNotes={p.notes}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
