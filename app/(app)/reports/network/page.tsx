import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { isNetworkReportTier } from "@/lib/workspaceCapabilities";
import { CONNECTED_CHILD_TIER_LABEL } from "@/lib/firmConnections";
import { ReportLayout } from "@/components/reports/ReportLayout";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { NetworkPeriodFilter } from "@/components/reports/NetworkPeriodFilter";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

type SearchParams = { pp_from?: string; pp_to?: string; po_from?: string; po_to?: string; po_status?: string };

function money(n: number | null | undefined) {
  return `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default async function NetworkReportPage({ searchParams }: { searchParams: SearchParams }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  // Server-side gate, independent of the Reports index tile being hidden --
  // a direct request to this route is rejected here regardless of how it
  // was reached. Redirects to the Reports index rather than /dashboard,
  // since this is a lateral move within Reports, not an out-of-area page.
  if (!isNetworkReportTier(workspace)) redirect("/reports");

  const supabase = createClient();
  const { data: isAdmin } = await supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id });
  if (!isAdmin) {
    return (
      <ReportLayout title="Network" description="Partner production and payout activity across your connected network.">
        <EmptyState icon={Lock} message="You need admin access to view network reports." />
      </ReportLayout>
    );
  }

  const partnerPeriodArgs = { p_period_start: searchParams.pp_from || undefined, p_period_end: searchParams.pp_to || undefined };
  const payoutStatus = searchParams.po_status === "pending" || searchParams.po_status === "paid" ? searchParams.po_status : undefined;

  const [
    { data: partnerRows, error: partnerError },
    { data: productionRows },
    { data: payoutRows, error: payoutError },
  ] = await Promise.all([
    // Existing Phase 5B RPC, unmodified -- same network scope
    // (network_child_relationship_types) every command center already uses.
    supabase.rpc("get_network_partner_production", { p_workspace_id: workspace.id, ...partnerPeriodArgs }),
    // Called only to read back the resolved period_start/period_end for the
    // exact same args -- avoids re-deriving "month to date" in JS and avoids
    // changing get_network_partner_production's return signature.
    supabase.rpc("get_network_production", { p_workspace_id: workspace.id, ...partnerPeriodArgs }),
    // New Phase 5E RPC -- reads firm_payouts as-is, no recomputation.
    supabase.rpc("get_network_payout_export", {
      p_workspace_id: workspace.id,
      p_period_start: searchParams.po_from || undefined,
      p_period_end: searchParams.po_to || undefined,
      p_status: payoutStatus,
    }),
  ]);

  const resolvedPeriod = productionRows?.[0] ?? null;
  const partnerRowsSafe = partnerRows ?? [];
  const payoutRowsSafe = payoutRows ?? [];

  const partnerCsvRows = partnerRowsSafe.map((p) => ({
    "Partner Name": p.partner_name,
    "Relationship Type": CONNECTED_CHILD_TIER_LABEL[p.relationship_type] ?? p.relationship_type,
    "Return Volume": Number(p.return_volume),
    Production: Number(p.production),
    "Period Start": resolvedPeriod?.period_start ?? "",
    "Period End": resolvedPeriod?.period_end ?? "",
  }));

  const payoutCsvRows = payoutRowsSafe.map((p) => ({
    "Partner Name": p.partner_name,
    "Period Start": p.period_start,
    "Period End": p.period_end,
    "Amount Owed": Number(p.amount_owed),
    Status: p.status,
  }));

  return (
    <ReportLayout title="Network" description="Partner production and payout activity across your connected network.">
      <div className="space-y-8">
        <section className="rounded-2xl border border-border bg-surface shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold text-ink">Partner Production</h2>
            <ExportButtons rows={partnerCsvRows} filename={`verexa-network-production-${today()}`} />
          </div>
          <div className="space-y-4 px-5 py-4">
            <NetworkPeriodFilter fromParam="pp_from" toParam="pp_to" />
            {partnerError ? (
              <p className="text-sm text-danger">Couldn&apos;t load partner production right now. Refresh the page to try again.</p>
            ) : partnerRowsSafe.length === 0 ? (
              <EmptyState message="No active network partners for this period." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                      <th className="px-3 py-2">Partner</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2 text-right">Return Volume</th>
                      <th className="px-3 py-2 text-right">Production</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {partnerRowsSafe.map((p) => (
                      <tr key={p.connection_id}>
                        <td className="px-3 py-2 text-slate">{p.partner_name}</td>
                        <td className="px-3 py-2 text-slate">{CONNECTED_CHILD_TIER_LABEL[p.relationship_type] ?? "Firm"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate">{Number(p.return_volume)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate">{money(p.production)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {resolvedPeriod && (
              <p className="text-[11px] text-muted">
                {resolvedPeriod.period_start} to {resolvedPeriod.period_end}.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold text-ink">Payouts</h2>
            <ExportButtons rows={payoutCsvRows} filename={`verexa-network-payouts-${today()}`} />
          </div>
          <div className="space-y-4 px-5 py-4">
            <NetworkPeriodFilter fromParam="po_from" toParam="po_to" statusParam="po_status" />
            {payoutError ? (
              <p className="text-sm text-danger">Couldn&apos;t load payouts right now. Refresh the page to try again.</p>
            ) : payoutRowsSafe.length === 0 ? (
              <EmptyState message="No payout records match this filter." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                      <th className="px-3 py-2">Partner</th>
                      <th className="px-3 py-2">Period</th>
                      <th className="px-3 py-2 text-right">Amount Owed</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {payoutRowsSafe.map((p, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-slate">{p.partner_name}</td>
                        <td className="px-3 py-2 text-muted">
                          {p.period_start} - {p.period_end}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate">{money(p.amount_owed)}</td>
                        <td className="px-3 py-2 capitalize text-slate">{p.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </ReportLayout>
  );
}
