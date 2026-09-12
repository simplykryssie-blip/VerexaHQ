import Link from "next/link";
import { ShieldCheck, CheckCircle2, Clock3, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHero, HeroHighlight } from "@/components/ui/PageHero";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { IRS_AUTHORIZATION_STATUS_LABELS, IRS_AUTHORIZATION_STATUS_TONE, type IrsAuthorizationStatus } from "@/lib/irsAuthorizationStatus";

export const dynamic = "force-dynamic";

function clientDisplayName(c: { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null }) {
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export default async function IrsAuthorizationsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: canView } = await supabase.rpc("has_permission", {
    p_workspace_id: workspace.id,
    p_permission_key: "irs_authorizations.view",
  });
  if (!canView) {
    return (
      <>
        <PageHero
          icon={ShieldCheck}
          tone="accent"
          heading={
            <>
              Your <HeroHighlight>IRS authorizations</HeroHighlight>.
            </>
          }
          subtitle="Form 8821 tax information authorizations, from identity verification through IRS status tracking."
        />
        <div className="flex-1 px-8 py-6">
          <EmptyState message="You don't have permission to view IRS authorizations." />
        </div>
      </>
    );
  }

  const { data: authorizations } = await supabase
    .from("irs_authorizations")
    .select("id, taxpayer_type, designee_name, status, created_at, clients(id, client_type, first_name, last_name, business_name)")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false });

  const rows = authorizations ?? [];
  const authorizedCount = rows.filter((r) => r.status === "authorized" || r.status === "transcript_eligible").length;
  const needsActionCount = rows.filter((r) => r.status === "identity_verification_rejected" || r.status === "denied" || r.status === "revoked").length;
  const inProgressCount = rows.length - authorizedCount - needsActionCount - rows.filter((r) => r.status === "draft").length;

  return (
    <>
      <PageHero
        icon={ShieldCheck}
        tone="accent"
        heading={
          <>
            Your <HeroHighlight>IRS authorizations</HeroHighlight>.
          </>
        }
        subtitle="Form 8821 tax information authorizations, from identity verification through IRS status tracking."
      />
      <div className="flex-1 space-y-6 px-8 py-6">
        <div className="grid grid-cols-4 gap-4">
          <StatTile icon={ShieldCheck} tone="accent" label="Total authorizations" value={rows.length} />
          <StatTile icon={CheckCircle2} tone="emerald" label="Authorized" value={authorizedCount} />
          <StatTile icon={Clock3} tone="violet" label="In progress" value={inProgressCount} />
          <StatTile icon={AlertTriangle} tone="rose" label="Needs action" value={needsActionCount} />
        </div>
        {rows.length === 0 ? (
          <EmptyState message="No IRS authorizations yet. Start one from a client's workspace page." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Taxpayer type</th>
                  <th className="px-4 py-2 font-medium">Designee</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const client = row.clients as unknown as {
                    id: string;
                    client_type: string;
                    first_name: string | null;
                    last_name: string | null;
                    business_name: string | null;
                  } | null;
                  const status = row.status as IrsAuthorizationStatus;
                  return (
                    <tr key={row.id} className="transition-colors hover:bg-surfaceMuted">
                      <td className="px-4 py-2.5">
                        <Link href={`/irs-authorizations/${row.id}`} className="font-medium text-accent hover:underline">
                          {client ? clientDisplayName(client) : "Unknown client"}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 capitalize text-slate">{row.taxpayer_type}</td>
                      <td className="px-4 py-2.5 text-slate">{row.designee_name}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={IRS_AUTHORIZATION_STATUS_TONE[status]}>{IRS_AUTHORIZATION_STATUS_LABELS[status]}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-slate">{new Date(row.created_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
