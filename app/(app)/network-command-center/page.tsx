import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Network,
  Building2,
  ClipboardCheck,
  Landmark,
  Wallet,
  GraduationCap,
  MessageSquare,
  Handshake,
  Package,
  UserPlus,
  Send,
  Lock,
  AlertTriangle,
  Clock,
  TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { isServiceBureauTier } from "@/lib/workspaceCapabilities";
import { CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE, CONNECTED_CHILD_TIER_LABEL } from "@/lib/firmConnections";
import { PageHero, HeroHighlight } from "@/components/ui/PageHero";
import { StatTile } from "@/components/ui/StatTile";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PeriodPicker } from "@/components/networkCommandCenter/PeriodPicker";
import { ONBOARDING_STATUS_LABEL, MANUAL_ONBOARDING_STAGE_LABEL } from "@/lib/partnerOnboarding";

export const dynamic = "force-dynamic";

type SearchParams = { from?: string; to?: string; sort?: string };

function money(n: number | null | undefined) {
  return `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Phase 6E: onboarding_stage is only ever authoritative for a manual/
// external firm; a VerexaHQ-workspace partner's real lifecycle uses
// partner_onboardings' 8-status vocabulary (ONBOARDING_STATUS_LABEL)
// instead. The two are never merged into one label map.
function currentStatusLabel(population: string, status: string | null) {
  if (!status) return "--";
  return population === "manual" ? MANUAL_ONBOARDING_STAGE_LABEL[status] ?? status : ONBOARDING_STATUS_LABEL[status] ?? status;
}

function buildHref(searchParams: SearchParams, overrides: Partial<SearchParams>) {
  const merged: SearchParams = { ...searchParams, ...overrides };
  const params = new URLSearchParams();
  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);
  if (merged.sort) params.set("sort", merged.sort);
  const qs = params.toString();
  return qs ? `/network-command-center?${qs}` : "/network-command-center";
}

function SectionError({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-dangerSoft/40 px-4 py-3 text-xs text-danger">
      <AlertTriangle size={14} aria-hidden="true" className="shrink-0" />
      <span>Couldn&apos;t load {label} right now. Refresh the page to try again.</span>
    </div>
  );
}

export default async function NetworkCommandCenterPage({ searchParams }: { searchParams: SearchParams }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  if (!isServiceBureauTier(workspace)) redirect("/dashboard");

  const supabase = createClient();

  const { data: isAdmin } = await supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id });
  if (!isAdmin) {
    return (
      <>
        <PageHero
          icon={Network}
          tone="violet"
          heading={
            <>
              Service Bureau <HeroHighlight>Network</HeroHighlight>.
            </>
          }
          subtitle="Manage your connected EROs, PTINs, production, onboarding, training, and network performance."
        />
        <div className="flex-1 px-8 py-6">
          <EmptyState icon={Lock} message="You need admin access on this workspace to view the Network Command Center." />
        </div>
      </>
    );
  }

  const periodArgs = { p_period_start: searchParams.from || undefined, p_period_end: searchParams.to || undefined };
  const sortBy = searchParams.sort === "return_volume" ? "return_volume" : "production";
  const childRelationshipTypes = CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE[workspace.workspace_type] ?? [];

  const [
    { data: partners, error: partnersError },
    { data: productionRows, error: productionError },
    { data: revenueShareRows, error: revenueShareError },
    { data: payoutRows, error: payoutError },
    { data: partnerProductionRows, error: partnerProductionError },
    { data: onboardingRows, error: onboardingError },
    { data: reviewStatusRows, error: reviewStatusError },
    { data: packageRevenueRows, error: packageRevenueError },
    { data: filingVolumeRows, error: filingVolumeError },
    { data: stalledPartners, error: stalledError },
    { data: assignmentRows },
    { data: threadRows },
    { data: onboardingRecords },
  ] = await Promise.all([
    childRelationshipTypes.length
      ? supabase.rpc("get_ero_connected_partners", { p_workspace_id: workspace.id, p_relationship_types: childRelationshipTypes })
      : Promise.resolve({ data: [] as never[], error: null }),
    supabase.rpc("get_network_production", { p_workspace_id: workspace.id, ...periodArgs }),
    supabase.rpc("get_network_revenue_share", { p_workspace_id: workspace.id, ...periodArgs }),
    supabase.rpc("get_network_payout_summary", { p_workspace_id: workspace.id }),
    supabase.rpc("get_network_partner_production", { p_workspace_id: workspace.id, ...periodArgs, p_sort_by: sortBy }),
    supabase.rpc("get_network_onboarding_summary", { p_workspace_id: workspace.id }),
    supabase.rpc("get_network_review_status_summary", { p_workspace_id: workspace.id }),
    supabase.rpc("get_network_package_revenue", { p_workspace_id: workspace.id }),
    supabase.rpc("get_network_filing_volume", { p_workspace_id: workspace.id }),
    supabase.rpc("get_network_stalled_partners", { p_workspace_id: workspace.id }),
    supabase.rpc("get_learning_assignment_rollup", { p_owner_workspace_id: workspace.id }),
    supabase.from("network_message_threads").select("id").or(`workspace_a_id.eq.${workspace.id},workspace_b_id.eq.${workspace.id}`),
    // Per-connection current onboarding status/completed_at for "recently
    // activated" below -- the same already-existing, workspace-scoped RPC
    // /firms already uses, reused rather than duplicated (Phase 6E).
    supabase.rpc("list_partner_onboardings", { p_workspace_id: workspace.id }),
  ]);

  const threadIds = (threadRows ?? []).map((t) => t.id);
  const { count: networkUnread } = threadIds.length
    ? await supabase
        .from("network_messages")
        .select("id", { count: "exact", head: true })
        .in("thread_id", threadIds)
        .neq("sender_workspace_id", workspace.id)
        .is("read_at", null)
    : { count: 0 };

  const allPartners = partners ?? [];
  // Connected Firms = active + pending (a firm mid-invite is still "connected"
  // in a meaningful sense); revoked connections are excluded. Distinct from
  // Active Connections below, which stays active-only -- see Phase 5C P1
  // correction Decision 1.
  const connectedFirms = allPartners.filter((p) => p.status !== "revoked");
  // Purely a connection-lifecycle count (firm_connections.status='active') --
  // labeled "Active Connections," not "Active Partners," so it's never read
  // as the Phase 6D "Operationally Active Partner" concept, which this tile
  // does not compute and does not gate on (Phase 6E).
  const activePartners = allPartners.filter((p) => p.status === "active");
  const eroCount = connectedFirms.filter((p) => CONNECTED_CHILD_TIER_LABEL[p.relationship_type] === "ERO").length;
  const ptinCount = connectedFirms.filter((p) => CONNECTED_CHILD_TIER_LABEL[p.relationship_type] === "PTIN").length;

  // "Recently activated" (Phase 6E): a VerexaHQ-workspace partner's real
  // signal is partner_onboardings reaching 'ready', never the manually-set
  // onboarding_stage; a manual firm has no partner_onboardings record at
  // all, so 'live' remains its only available signal.
  const onboardingByConnectionId = new Map((onboardingRecords ?? []).map((o) => [o.firm_connection_id, o]));
  const recentlyActivatedPartners = activePartners
    .filter((p) => p.child_workspace_id && onboardingByConnectionId.get(p.connection_id)?.status === "ready")
    .map((p) => {
      const record = onboardingByConnectionId.get(p.connection_id);
      return { connectionId: p.connection_id, name: p.name, badgeLabel: "Ready", at: record?.completed_at ?? record?.updated_at ?? p.responded_at ?? p.created_at };
    });
  const recentlyActivatedManual = activePartners
    .filter((p) => p.source === "manual" && p.onboarding_stage === "live")
    .map((p) => ({ connectionId: p.connection_id, name: p.name, badgeLabel: "Live", at: p.responded_at ?? p.created_at }));
  const recentlyActivated = [...recentlyActivatedPartners, ...recentlyActivatedManual]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 5);

  const production = productionRows?.[0] ?? null;
  const revenueShare = revenueShareRows?.[0] ?? null;
  const payouts = payoutRows?.[0] ?? null;
  const onboarding = onboardingRows?.[0] ?? null;
  const reviewStatus = reviewStatusRows?.[0] ?? null;
  const packageRevenue = packageRevenueRows?.[0] ?? null;
  const filingVolume = filingVolumeRows?.[0] ?? null;
  const stalled = stalledPartners ?? [];
  const topPartners = (partnerProductionRows ?? []).slice(0, 5);

  // Phase 6E: population-aware. Manual/external firms are "pending" until
  // 'live'; VerexaHQ-workspace partners are "pending" until their current
  // onboarding reaches a terminal state (ready/rejected/withdrawn) -- a
  // rejected or withdrawn onboarding is not "still pending," it's finished.
  const manualTotalOnboarding = onboarding
    ? onboarding.manual_invited_count + onboarding.manual_agreement_signed_count + onboarding.manual_software_provisioned_count + onboarding.manual_live_count
    : 0;
  const manualPendingCount = onboarding
    ? onboarding.manual_invited_count + onboarding.manual_agreement_signed_count + onboarding.manual_software_provisioned_count
    : 0;
  const partnerTotalOnboarding = onboarding
    ? onboarding.partner_pending_count +
      onboarding.partner_in_progress_count +
      onboarding.partner_under_review_count +
      onboarding.partner_approved_count +
      onboarding.partner_setup_count +
      onboarding.partner_ready_count +
      onboarding.partner_rejected_count +
      onboarding.partner_withdrawn_count
    : 0;
  const partnerPendingCount = onboarding
    ? onboarding.partner_pending_count + onboarding.partner_in_progress_count + onboarding.partner_under_review_count + onboarding.partner_approved_count + onboarding.partner_setup_count
    : 0;
  const pendingOnboardingCount = manualPendingCount + partnerPendingCount;

  const assignments = assignmentRows ?? [];
  const trainingAssignedCount = assignments.length;
  const trainingCompletedCount = assignments.filter((a) => a.total_modules > 0 && a.completed_modules >= a.total_modules).length;
  const trainingOverdueCount = assignments.filter(
    (a) => a.due_date && new Date(a.due_date) < new Date() && !(a.total_modules > 0 && a.completed_modules >= a.total_modules)
  ).length;
  const trainingCompletionRate = trainingAssignedCount > 0 ? Math.round((trainingCompletedCount / trainingAssignedCount) * 100) : null;

  const unreadCount = networkUnread ?? 0;
  // Matches Review Queue's own definition of "awaiting your review" --
  // pending + corrections_requested -- so this headline number never
  // undercounts relative to what /review-queue itself shows. See Phase 5C
  // P1 correction Decision 3.
  const awaitingReviewCount = reviewStatus ? reviewStatus.awaiting_review_count + reviewStatus.corrections_requested_count : 0;
  const needsAttentionCount = stalled.length + awaitingReviewCount + trainingOverdueCount + unreadCount;

  return (
    <>
      <PageHero
        icon={Network}
        tone="violet"
        heading={
          <>
            Service Bureau <HeroHighlight>Network</HeroHighlight>.
          </>
        }
        subtitle="Manage your connected EROs, PTINs, production, onboarding, training, and network performance."
        actions={
          <div className="flex flex-col items-end gap-2">
            <PeriodPicker />
            <Link href="/messages" className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
              <MessageSquare size={12} aria-hidden="true" />
              {unreadCount > 0 ? `${unreadCount} unread network message${unreadCount === 1 ? "" : "s"}` : "Network Messages"}
            </Link>
          </div>
        }
      />

      <div className="flex-1 space-y-8 px-8 py-6">
        {/* KPI Row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/firms" className="block">
            <StatTile
              icon={Building2}
              tone="accent"
              label="Connected Firms"
              value={
                <>
                  {connectedFirms.length}
                  <span className="mt-0.5 block text-[11px] font-normal normal-case text-muted">
                    {eroCount} ERO{eroCount === 1 ? "" : "s"} &middot; {ptinCount} PTIN{ptinCount === 1 ? "" : "s"}
                  </span>
                </>
              }
            />
          </Link>
          <Link href="/firms" className="block">
            <StatTile icon={Handshake} tone="emerald" label="Active Connections" value={activePartners.length} />
          </Link>
          <Link href="/firms?onboarding=pending" className="block">
            <StatTile icon={Clock} tone="amber" label="Pending Onboarding" value={onboarding ? pendingOnboardingCount : "--"} />
          </Link>
          <Link href="/review-queue" className="block">
            <StatTile icon={ClipboardCheck} tone="rose" label="Filing Information Awaiting Review" value={reviewStatus ? awaitingReviewCount : "--"} />
          </Link>
          <Link href="/tax" className="block">
            <StatTile icon={Landmark} tone="violet" label={filingVolume?.tax_year ? `Network Filings (${filingVolume.tax_year})` : "Network Filings"} value={filingVolume ? Number(filingVolume.total_returns) : "--"} />
          </Link>
          <Link href="/firms" className="block">
            <StatTile
              icon={Wallet}
              tone="amber"
              label="Pending Payouts"
              value={
                payouts ? (
                  <>
                    {payouts.pending_count}
                    <span className="mt-0.5 block text-[11px] font-normal normal-case text-muted">{money(payouts.pending_amount)}</span>
                  </>
                ) : (
                  "--"
                )
              }
            />
          </Link>
        </div>

        {/* Needs Attention */}
        <SectionCard title="Needs Attention" accent="rose">
          {needsAttentionCount === 0 ? (
            <EmptyState message="Nothing needs your attention right now." />
          ) : (
            <ul className="space-y-3">
              {stalled.length > 0 && (
                <li className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-ink">
                      {stalled.length} partner{stalled.length === 1 ? "" : "s"} with no activity in 14 days
                    </p>
                    <Link href="/firms?onboarding=pending" className="text-xs font-medium text-accent hover:underline">
                      View
                    </Link>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    {stalled.slice(0, 5).map((p) => (
                      <li key={p.connection_id}>
                        {p.partner_name} &middot; {currentStatusLabel(p.population, p.current_status)}
                      </li>
                    ))}
                  </ul>
                </li>
              )}
              {awaitingReviewCount > 0 && (
                <li className="flex items-center justify-between rounded-xl border border-border p-3">
                  <p className="text-sm font-medium text-ink">{awaitingReviewCount} filing{awaitingReviewCount === 1 ? "" : "s"} awaiting review</p>
                  <Link href="/review-queue" className="text-xs font-medium text-accent hover:underline">
                    Review Queue
                  </Link>
                </li>
              )}
              {trainingOverdueCount > 0 && (
                <li className="flex items-center justify-between rounded-xl border border-border p-3">
                  <p className="text-sm font-medium text-ink">{trainingOverdueCount} overdue training assignment{trainingOverdueCount === 1 ? "" : "s"}</p>
                  <Link href="/learning/manage/progress" className="text-xs font-medium text-accent hover:underline">
                    Learning Hub
                  </Link>
                </li>
              )}
              {unreadCount > 0 && (
                <li className="flex items-center justify-between rounded-xl border border-border p-3">
                  <p className="text-sm font-medium text-ink">{unreadCount} unread network message{unreadCount === 1 ? "" : "s"}</p>
                  <Link href="/messages" className="text-xs font-medium text-accent hover:underline">
                    Messages
                  </Link>
                </li>
              )}
            </ul>
          )}
        </SectionCard>

        {/* Manual Firm Progress -- onboarding_stage is only ever
            authoritative for a manual/external connection (Phase 6E);
            renamed from "Network Health" since it no longer covers the
            whole network. */}
        <SectionCard title="Manual Firm Progress">
          {onboardingError ? (
            <SectionError label="manual firm progress" />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(["invited", "agreement_signed", "software_provisioned", "live"] as const).map((stage) => {
                const count =
                  stage === "invited"
                    ? onboarding?.manual_invited_count ?? 0
                    : stage === "agreement_signed"
                      ? onboarding?.manual_agreement_signed_count ?? 0
                      : stage === "software_provisioned"
                        ? onboarding?.manual_software_provisioned_count ?? 0
                        : onboarding?.manual_live_count ?? 0;
                const pct = manualTotalOnboarding > 0 ? Math.round((count / manualTotalOnboarding) * 100) : 0;
                return (
                  <Link key={stage} href={`/firms?onboarding=manual_${stage}`} className="block rounded-xl border border-border p-3 transition hover:border-accent">
                    <p className="text-xs uppercase tracking-wide text-muted">{MANUAL_ONBOARDING_STAGE_LABEL[stage]}</p>
                    <p className="mt-1 font-display text-xl font-semibold text-ink">{count}</p>
                    <div className="mt-2">
                      <ProgressBar percent={pct} tone={stage === "live" ? "gradient" : "accent"} size="sm" />
                    </div>
                    <p className="mt-1 text-[11px] text-muted">{pct}% of manual firms</p>
                  </Link>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* Partner Onboarding */}
        <SectionCard title="Partner Onboarding" action={<Link href="/firms" className="text-xs font-medium text-accent hover:underline">View Firms</Link>}>
          {onboardingError ? (
            <SectionError label="onboarding data" />
          ) : (
            <>
              <p className="text-sm text-slate">
                {partnerTotalOnboarding} VerexaHQ-workspace partner{partnerTotalOnboarding === 1 ? "" : "s"} onboarding &middot; {manualTotalOnboarding} manual/external firm
                {manualTotalOnboarding === 1 ? "" : "s"} tracked
                {onboarding && onboarding.pending_invitations_count > 0
                  ? ` · ${onboarding.pending_invitations_count} pending invitation${onboarding.pending_invitations_count === 1 ? "" : "s"} not yet redeemed`
                  : ""}
              </p>
              <p className="mt-1 text-xs text-muted">
                Workspace partners: {onboarding?.partner_pending_count ?? 0} pending · {onboarding?.partner_in_progress_count ?? 0} in progress ·{" "}
                {onboarding?.partner_under_review_count ?? 0} under review · {onboarding?.partner_approved_count ?? 0} approved · {onboarding?.partner_setup_count ?? 0} setup ·{" "}
                {onboarding?.partner_ready_count ?? 0} ready
              </p>
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">No activity in 14 days</h3>
                  {stalledError ? (
                    <div className="mt-2">
                      <SectionError label="stalled partners" />
                    </div>
                  ) : stalled.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">Every onboarding connection has recent activity.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
                      {stalled.slice(0, 5).map((p) => (
                        <li key={p.connection_id} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span className="text-slate">{p.partner_name}</span>
                          <Badge tone="warning">{currentStatusLabel(p.population, p.current_status)}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Recently activated</h3>
                  {recentlyActivated.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">No partners have gone live or reached ready yet.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
                      {recentlyActivated.map((p) => (
                        <li key={p.connectionId} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span className="text-slate">{p.name}</span>
                          <Badge tone="success">{p.badgeLabel}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </SectionCard>

        {/* Network Production */}
        <SectionCard title="Network Production" accent="emerald">
          {productionError || !production ? (
            <SectionError label="network production" />
          ) : (
            <div className="flex flex-col items-start gap-1">
              <p className="font-display text-3xl font-semibold text-ink">{money(production.network_production)}</p>
              <p className="text-xs text-muted">
                {production.period_start} to {production.period_end} &middot; {production.connection_count} active connection
                {production.connection_count === 1 ? "" : "s"}
              </p>
              {Number(production.network_production) === 0 && (
                <p className="text-xs text-muted">No network production for this period.</p>
              )}
              <Link href="#partner-performance" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                <TrendingUp size={12} aria-hidden="true" /> See partner-level production
              </Link>
            </div>
          )}
        </SectionCard>

        {/* Partner Performance */}
        <SectionCard
          title="Partner Performance"
          action={
            <div className="flex items-center gap-3 text-xs">
              <Link href={buildHref(searchParams, { sort: "production" })} className={sortBy === "production" ? "font-semibold text-accent" : "font-medium text-muted hover:text-accent"}>
                Sort by Production
              </Link>
              <Link href={buildHref(searchParams, { sort: "return_volume" })} className={sortBy === "return_volume" ? "font-semibold text-accent" : "font-medium text-muted hover:text-accent"}>
                Sort by Return Volume
              </Link>
            </div>
          }
        >
          <div id="partner-performance" />
          {partnerProductionError ? (
            <SectionError label="partner performance" />
          ) : topPartners.length === 0 ? (
            <EmptyState icon={Building2} message="No active network partners yet." action={<Link href="/settings/users" className="text-xs font-medium text-accent hover:underline">Invite Partner</Link>} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                      <th className="px-3 py-2">Partner</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2 text-right">Return Volume</th>
                      <th className="px-3 py-2 text-right">Production</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {topPartners.map((p) => (
                      <tr key={p.connection_id}>
                        <td className="px-3 py-2">
                          <Link href={`/firms/${p.connection_id}`} className="font-medium text-accent hover:underline">
                            {p.partner_name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-slate">{CONNECTED_CHILD_TIER_LABEL[p.relationship_type] ?? "Firm"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate">{Number(p.return_volume)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate">{money(p.production)}</td>
                        <td className="px-3 py-2">
                          <Badge tone="success">Active</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Link href="/firms" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                View All Partners
              </Link>
            </>
          )}
        </SectionCard>

        {/* Financials */}
        <SectionCard title="Financials">
          {revenueShareError || payoutError || packageRevenueError ? (
            <SectionError label="financials" />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Link href="#partner-performance" className="block">
                <StatTile icon={TrendingUp} tone="emerald" label="Network Production" value={production ? money(production.network_production) : "--"} />
              </Link>
              <Link href="/firms" className="block">
                <StatTile icon={Handshake} tone="accent" label="Network Revenue Share" value={revenueShare ? money(revenueShare.network_revenue_share) : "--"} />
              </Link>
              <Link href="/firms" className="block">
                <StatTile
                  icon={Wallet}
                  tone="amber"
                  label="Pending Payouts"
                  value={
                    payouts ? (
                      <>
                        {money(payouts.pending_amount)}
                        <span className="mt-0.5 block text-[11px] font-normal normal-case text-muted">{payouts.pending_count} record{payouts.pending_count === 1 ? "" : "s"}</span>
                      </>
                    ) : (
                      "--"
                    )
                  }
                />
              </Link>
              <Link href="/firms" className="block">
                <StatTile
                  icon={Wallet}
                  tone="violet"
                  label="Paid Payouts"
                  value={
                    payouts ? (
                      <>
                        {money(payouts.paid_amount)}
                        <span className="mt-0.5 block text-[11px] font-normal normal-case text-muted">{payouts.paid_count} record{payouts.paid_count === 1 ? "" : "s"}</span>
                      </>
                    ) : (
                      "--"
                    )
                  }
                />
              </Link>
              <Link href="/settings/packages" className="block">
                <StatTile
                  icon={Package}
                  tone="rose"
                  label="Package Revenue"
                  value={
                    packageRevenue ? (
                      <>
                        {money(packageRevenue.active_package_revenue)}
                        <span className="mt-0.5 block text-[11px] font-normal normal-case text-muted">
                          {packageRevenue.active_purchase_count} active purchase{packageRevenue.active_purchase_count === 1 ? "" : "s"}
                        </span>
                      </>
                    ) : (
                      "--"
                    )
                  }
                />
              </Link>
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted">
            Network Production and Revenue Share are calculated live for {production ? `${production.period_start} to ${production.period_end}` : "the selected period"}. Package Revenue reflects
            current active subscriptions and is kept separate from network production.
          </p>
        </SectionCard>

        {/* Training */}
        <SectionCard title="Training" action={<Link href="/learning/manage" className="text-xs font-medium text-accent hover:underline">Manage Training</Link>}>
          {assignmentRows === null ? (
            <p className="text-sm text-muted">Training data isn&apos;t available for your role.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatTile icon={GraduationCap} tone="accent" label="Assigned" value={trainingAssignedCount} />
              <StatTile icon={GraduationCap} tone="emerald" label="Completed" value={trainingCompletedCount} />
              <StatTile icon={GraduationCap} tone="violet" label="Completion Rate" value={trainingCompletionRate !== null ? `${trainingCompletionRate}%` : "--"} />
            </div>
          )}
        </SectionCard>

        {/* Quick Actions */}
        <SectionCard title="Quick Actions">
          <nav aria-label="Quick actions" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Invite Partner", href: "/settings/users", icon: UserPlus, chip: "bg-accentSoft text-accent" },
              { label: "Review Filing", href: "/review-queue", icon: ClipboardCheck, chip: "bg-roseSoft text-rose" },
              { label: "View Network", href: "/firms", icon: Building2, chip: "bg-violetSoft text-violet" },
              { label: "Send Network Message", href: "/messages", icon: Send, chip: "bg-accentSoft text-accent" },
              { label: "Manage Training", href: "/learning/manage", icon: GraduationCap, chip: "bg-emeraldSoft text-emerald" },
              { label: "Manage Banks & Software", href: "/settings/bank-partners", icon: Wallet, chip: "bg-amberSoft text-amber" },
              { label: "Manage Packages", href: "/settings/packages", icon: Package, chip: "bg-roseSoft text-rose" },
            ].map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="flex flex-col items-center gap-2 rounded-xl border border-border px-3 py-3 text-center text-xs font-medium text-slate transition hover:border-accent"
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${a.chip}`}>
                  <a.icon size={16} aria-hidden="true" />
                </span>
                {a.label}
              </Link>
            ))}
          </nav>
        </SectionCard>

        {partnersError && <SectionError label="connected firms" />}
      </div>
    </>
  );
}
