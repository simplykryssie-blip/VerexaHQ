import { Wallet, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHero, HeroHighlight } from "@/components/ui/PageHero";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/Badge";
import {
  deriveChecklist,
  deriveWaitingOn,
  ONBOARDING_STATUS_TONE,
  ONBOARDING_STATUS_LABEL,
  type PartnerOnboardingRow,
} from "@/lib/partnerOnboarding";

export const dynamic = "force-dynamic";

function money(n: number | null | undefined) {
  return `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const RELATIONSHIP_LABEL: Record<string, string> = {
  ero_ptin: "Your ERO",
  service_bureau_ero: "Your Service Bureau",
  service_bureau_ptin: "Your Service Bureau",
};

type Payout = {
  id: string;
  period_start: string;
  period_end: string;
  gross_prep_fees: number;
  gross_bank_product_rebates: number;
  gross_bank_fees: number;
  gross_addon_fees: number;
  gross_transmission_fees: number;
  gross_paperwork_fees: number;
  ero_share_amount: number;
  amount_owed_to_ptin: number;
  status: string;
  paid_at: string | null;
};

// Your own view of what a real, official payout run (generate_firm_payout,
// only your parent firm can trigger it) will look like this period --
// mirrors that function's math exactly so this estimate never drifts from
// what actually lands on the ledger once they run it.
function estimateSplit(production: Record<string, unknown>, sharePercent: number, scope: string | null) {
  const prepFees = Number(production.gross_prep_fees ?? 0);
  const rebates = Number(production.gross_bank_product_rebates ?? 0);
  const bankFees = Number(production.gross_bank_fees ?? 0);
  const addonFees = Number(production.gross_addon_fees ?? 0);
  const transmissionFees = Number(production.gross_transmission_fees ?? 0);
  const paperworkFees = Number(production.gross_paperwork_fees ?? 0);
  const netRebates = Math.max(rebates - bankFees - addonFees - transmissionFees - paperworkFees, 0);
  const feesDeducted = bankFees + addonFees + transmissionFees + paperworkFees;

  let eroShare = 0;
  if (scope === "bank_products_only") eroShare = netRebates * (sharePercent / 100);
  else if (scope === "prep_fees_only") eroShare = prepFees * (sharePercent / 100);
  else eroShare = (prepFees + netRebates) * (sharePercent / 100);

  const netToYou = prepFees + netRebates - eroShare;

  return { prepFees, rebates, feesDeducted, eroShare, netToYou };
}

export default async function PartnerDashboardPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: connections }, { data: onboardingRows }] = await Promise.all([
    supabase.rpc("get_my_ero_connection", { p_workspace_id: workspace.id }),
    supabase.rpc("get_my_partner_onboarding", { p_workspace_id: workspace.id }),
  ]);
  const connection = (connections ?? [])[0] ?? null;
  // Disappears once ready (spec section 24) -- a partner doesn't need to
  // keep seeing a finished checklist on their main dashboard.
  const onboarding = ((onboardingRows ?? [])[0] as PartnerOnboardingRow & { id: string; review_note: string | null; rejected_reason: string | null }) ?? null;
  const showOnboarding = Boolean(onboarding && onboarding.status !== "ready");

  if (!connection) {
    return (
      <>
        <PageHero
          icon={Wallet}
          tone="emerald"
          heading={
            <>
              Your <HeroHighlight>partner dashboard</HeroHighlight>.
            </>
          }
          subtitle="Your split, assigned bank/software, production, and payout history with your parent firm."
        />
        <div className="flex-1 px-8 py-6">
          <EmptyState icon={Building2} message="You're not connected to a parent firm yet." />
        </div>
      </>
    );
  }

  const [{ data: production }, { data: payouts }] = await Promise.all([
    supabase.rpc("get_firm_production", { p_connection_id: connection.connection_id }),
    supabase
      .from("firm_payouts")
      .select(
        "id, period_start, period_end, gross_prep_fees, gross_bank_product_rebates, gross_bank_fees, gross_addon_fees, gross_transmission_fees, gross_paperwork_fees, ero_share_amount, amount_owed_to_ptin, status, paid_at"
      )
      .eq("connection_id", connection.connection_id)
      .order("period_start", { ascending: false }),
  ]);

  const estimate = production
    ? estimateSplit(production as Record<string, unknown>, connection.revenue_share_percent ?? 0, connection.revenue_share_scope)
    : null;

  const relationshipLabel = RELATIONSHIP_LABEL[connection.relationship_type] ?? "Your parent firm";
  const payoutRows = (payouts ?? []) as Payout[];

  return (
    <>
      <PageHero
        icon={Wallet}
        tone="emerald"
        heading={
          <>
            Your <HeroHighlight>partner dashboard</HeroHighlight>.
          </>
        }
        subtitle={`Your split, assigned bank/software, production, and payout history with ${connection.name}.`}
      />

      <div className="flex-1 space-y-6 px-8 py-6">
        {showOnboarding && onboarding && (
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink">Your Onboarding</p>
              <Badge tone={ONBOARDING_STATUS_TONE[onboarding.status] ?? "neutral"}>{ONBOARDING_STATUS_LABEL[onboarding.status] ?? onboarding.status}</Badge>
            </div>
            {(() => {
              const waiting = deriveWaitingOn(onboarding);
              const checklist = deriveChecklist(onboarding);
              return (
                <>
                  <p className="mt-2 text-sm text-slate">{waiting.detail}</p>
                  <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-3">
                    {checklist.map((item) => (
                      <li key={item.key} className="flex items-center gap-1.5 text-xs">
                        <span
                          className={
                            item.state === "complete"
                              ? "text-success"
                              : item.state === "not_required"
                                ? "text-muted line-through"
                                : item.state === "active"
                                  ? "font-medium text-accent"
                                  : "text-muted"
                          }
                        >
                          {item.state === "complete" ? "✓" : item.state === "not_required" ? "−" : "○"} {item.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {onboarding.status === "in_progress" && onboarding.review_note && (
                    <p className="mt-3 rounded-lg border border-warning/30 bg-warningSoft px-3 py-2 text-xs text-warning">
                      Information requested: {onboarding.review_note}
                    </p>
                  )}
                  {onboarding.status === "rejected" && onboarding.rejected_reason && (
                    <p className="mt-3 rounded-lg border border-danger/30 bg-dangerSoft px-3 py-2 text-xs text-danger">{onboarding.rejected_reason}</p>
                  )}
                </>
              );
            })()}
          </div>
        )}

        <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink">{relationshipLabel}</p>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Firm</dt>
              <dd className="mt-0.5 font-medium text-slate">{connection.name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Package</dt>
              <dd className="mt-0.5 font-medium text-slate">{connection.package_name ?? "No package assigned"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Your split</dt>
              <dd className="mt-0.5 font-medium text-slate">
                {connection.revenue_share_percent != null ? `${connection.revenue_share_percent}% to firm` : "--"}
                {connection.revenue_share_scope && (
                  <span className="ml-1 text-xs text-muted">({connection.revenue_share_scope.replace(/_/g, " ")})</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Contact</dt>
              <dd className="mt-0.5 font-medium text-slate">{connection.primary_contact_email ?? connection.phone ?? "--"}</dd>
            </div>
          </dl>
          {(connection.bank_partner_name || connection.software_partner_name) && (
            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Assigned bank</dt>
                <dd className="mt-0.5 font-medium text-slate">{connection.bank_partner_name ?? "None assigned"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Assigned software</dt>
                <dd className="mt-0.5 font-medium text-slate">{connection.software_partner_name ?? "None assigned"}</dd>
              </div>
            </div>
          )}
        </div>

        {estimate && (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink">
              This period, estimated ({String((production as Record<string, unknown>).period_start)} to{" "}
              {String((production as Record<string, unknown>).period_end)})
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile icon={Wallet} tone="accent" label="Prep fees billed" value={money(estimate.prepFees)} />
              <StatTile icon={Wallet} tone="violet" label="Bank rebates" value={money(estimate.rebates)} />
              <StatTile icon={Wallet} tone="amber" label="Fees deducted" value={estimate.feesDeducted > 0 ? `-${money(estimate.feesDeducted)}` : money(0)} />
              <StatTile icon={Wallet} tone="emerald" label="Estimated net to you" value={money(estimate.netToYou)} />
            </div>
            <p className="mt-2 text-xs text-muted">
              An estimate from this period&apos;s activity so far -- the official amount is whatever {connection.name} generates on the payout
              ledger below.
            </p>
          </div>
        )}

        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink">Payout history</p>
          {payoutRows.length === 0 ? (
            <p className="text-sm text-muted">No payouts calculated yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
              <table className="w-full text-sm">
                <thead className="bg-surfaceMuted text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Period</th>
                    <th className="px-3 py-2 text-right">Gross collected</th>
                    <th className="px-3 py-2 text-right">Fees deducted</th>
                    <th className="px-3 py-2 text-right">Net production</th>
                    <th className="px-3 py-2 text-right">{relationshipLabel}&apos;s share</th>
                    <th className="px-3 py-2 text-right">Owed to you</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payoutRows.map((p) => {
                    const grossCollected = p.gross_prep_fees + p.gross_bank_product_rebates;
                    const feesDeducted = p.gross_bank_fees + p.gross_addon_fees + p.gross_transmission_fees + p.gross_paperwork_fees;
                    const netProduction = p.ero_share_amount + p.amount_owed_to_ptin;
                    return (
                      <tr key={p.id}>
                        <td className="px-3 py-2 text-slate">
                          {p.period_start} - {p.period_end}
                        </td>
                        <td className="px-3 py-2 text-right text-slate">{money(grossCollected)}</td>
                        <td className="px-3 py-2 text-right text-slate">{feesDeducted > 0 ? `-${money(feesDeducted)}` : money(0)}</td>
                        <td className="px-3 py-2 text-right text-slate">{money(netProduction)}</td>
                        <td className="px-3 py-2 text-right text-slate">{money(p.ero_share_amount)}</td>
                        <td className="px-3 py-2 text-right font-medium text-ink">{money(p.amount_owed_to_ptin)}</td>
                        <td className="px-3 py-2">
                          <Badge tone={p.status === "paid" ? "success" : p.status === "disputed" ? "danger" : "neutral"}>{p.status}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
