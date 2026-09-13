import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Network,
  Building2,
  Handshake,
  ClipboardCheck,
  Landmark,
  Wallet,
  GraduationCap,
  MessageSquare,
  UserPlus,
  Send,
  Lock,
  AlertTriangle,
  TrendingUp,
  Briefcase,
  Clock,
  Receipt,
  Users,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { isEroOfficeTier } from "@/lib/workspaceCapabilities";
import { CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE } from "@/lib/firmConnections";
import { getDashboardData } from "@/lib/dashboard/data";
import { getWorkspaceMemberWorkload } from "@/lib/workspaceStaff";
import { PageHero, HeroHighlight } from "@/components/ui/PageHero";
import { StatTile } from "@/components/ui/StatTile";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { PeriodPicker } from "@/components/networkCommandCenter/PeriodPicker";

export const dynamic = "force-dynamic";

type SearchParams = { from?: string; to?: string; sort?: string };

function money(n: number | null | undefined) {
  return `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildHref(searchParams: SearchParams, overrides: Partial<SearchParams>) {
  const merged: SearchParams = { ...searchParams, ...overrides };
  const params = new URLSearchParams();
  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);
  if (merged.sort) params.set("sort", merged.sort);
  const qs = params.toString();
  return qs ? `/ero-network?${qs}` : "/ero-network";
}

function SectionError({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-dangerSoft/40 px-4 py-3 text-xs text-danger">
      <AlertTriangle size={14} aria-hidden="true" className="shrink-0" />
      <span>Couldn&apos;t load {label} right now. Refresh the page to try again.</span>
    </div>
  );
}

export default async function EroNetworkPage({ searchParams }: { searchParams: SearchParams }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  if (!isEroOfficeTier(workspace)) redirect("/dashboard");

  const supabase = createClient();

  const { data: isAdmin } = await supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id });
  if (!isAdmin) {
    return (
      <>
        <PageHero
          icon={Network}
          tone="accent"
          heading={
            <>
              My <HeroHighlight>ERO Network</HeroHighlight>.
            </>
          }
          subtitle="Manage your connected PTINs, production, review, training, and network performance."
        />
        <div className="flex-1 px-8 py-6">
          <EmptyState icon={Lock} message="You need admin access on this workspace to view the ERO Network Command Center." />
        </div>
      </>
    );
  }

  const periodArgs = { p_period_start: searchParams.from || undefined, p_period_end: searchParams.to || undefined };
  const sortBy = searchParams.sort === "return_volume" ? "return_volume" : "production";
  // Authoritative existing scoping abstraction -- resolves to ['ero_ptin']
  // for an ero_office workspace, same constant/helper Phase 5B/5C already
  // established (network_child_relationship_types mirrors this exactly on
  // the SQL side). No new relationship type or mapping introduced.
  const childRelationshipTypes = CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE[workspace.workspace_type] ?? [];

  const [
    { data: partners, error: partnersError },
    { data: productionRows, error: productionError },
    { data: revenueShareRows, error: revenueShareError },
    { data: payoutRows, error: payoutError },
    { data: partnerProductionRows, error: partnerProductionError },
    { data: reviewStatusRows, error: reviewStatusError },
    { data: filingVolumeRows, error: filingVolumeError },
    { data: stalledPartners, error: stalledError },
    { data: assignmentRows },
    { data: threadRows },
    officeData,
    { members },
  ] = await Promise.all([
    childRelationshipTypes.length
      ? supabase.rpc("get_ero_connected_partners", { p_workspace_id: workspace.id, p_relationship_types: childRelationshipTypes })
      : Promise.resolve({ data: [] as never[], error: null }),
    supabase.rpc("get_network_production", { p_workspace_id: workspace.id, ...periodArgs }),
    supabase.rpc("get_network_revenue_share", { p_workspace_id: workspace.id, ...periodArgs }),
    supabase.rpc("get_network_payout_summary", { p_workspace_id: workspace.id }),
    supabase.rpc("get_network_partner_production", { p_workspace_id: workspace.id, ...periodArgs, p_sort_by: sortBy }),
    supabase.rpc("get_network_review_status_summary", { p_workspace_id: workspace.id }),
    supabase.rpc("get_network_filing_volume", { p_workspace_id: workspace.id }),
    supabase.rpc("get_network_stalled_partners", { p_workspace_id: workspace.id }),
    supabase.rpc("get_learning_assignment_rollup", { p_owner_workspace_id: workspace.id }),
    supabase.from("network_message_threads").select("id").or(`workspace_a_id.eq.${workspace.id},workspace_b_id.eq.${workspace.id}`),
    // My Office: the exact same existing data sources /dashboard and the
    // old /ero-dashboard already used -- no new office query, no
    // duplicated dashboard.
    getDashboardData(workspace.id),
    getWorkspaceMemberWorkload(supabase, workspace.id),
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
  // Connected Partners = active + pending, revoked excluded -- same formula
  // established and approved in Phase 5C. Active Partners stays active-only.
  const connectedPartners = allPartners.filter((p) => p.status !== "revoked");
  const activePartners = allPartners.filter((p) => p.status === "active");

  const production = productionRows?.[0] ?? null;
  const revenueShare = revenueShareRows?.[0] ?? null;
  const payouts = payoutRows?.[0] ?? null;
  const reviewStatus = reviewStatusRows?.[0] ?? null;
  const filingVolume = filingVolumeRows?.[0] ?? null;
  const stalled = stalledPartners ?? [];
  const partnerRows = partnerProductionRows ?? [];
  const topPartners = partnerRows.slice(0, 5);
  // Network-wide return volume: a plain sum over the already-fetched,
  // already-aggregated per-partner rows -- not a new calculation, not a
  // per-partner RPC call, just a display total of numbers the database
  // already computed.
  const networkReturnVolume = partnerRows.reduce((sum, p) => sum + Number(p.return_volume), 0);

  // Same Phase 5C formula: awaiting action = pending + corrections_requested.
  const awaitingReviewCount = reviewStatus ? reviewStatus.awaiting_review_count + reviewStatus.corrections_requested_count : 0;

  const unreadCount = networkUnread ?? 0;
  const needsAttentionCount = stalled.length + awaitingReviewCount + unreadCount;

  const assignments = assignmentRows ?? [];
  const trainingAssignedCount = assignments.length;
  const trainingCompletedCount = assignments.filter((a) => a.total_modules > 0 && a.completed_modules >= a.total_modules).length;
  const trainingCompletionRate = trainingAssignedCount > 0 ? Math.round((trainingCompletedCount / trainingAssignedCount) * 100) : null;

  const activeMemberCount = members.filter((m) => m.status === "active").length;

  return (
    <>
      <PageHero
        icon={Network}
        tone="accent"
        heading={
          <>
            My <HeroHighlight>ERO Network</HeroHighlight>.
          </>
        }
        subtitle="Manage your connected PTINs, production, review, training, and network performance."
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
            <StatTile icon={Building2} tone="accent" label="Connected Partners" value={connectedPartners.length} />
          </Link>
          <Link href="/firms" className="block">
            <StatTile icon={Handshake} tone="emerald" label="Active Partners" value={activePartners.length} />
          </Link>
          <Link href="/review-queue" className="block">
            <StatTile icon={ClipboardCheck} tone="rose" label="Awaiting Review" value={reviewStatus ? awaitingReviewCount : "--"} />
          </Link>
          <Link href="/tax" className="block">
            <StatTile icon={Landmark} tone="violet" label={filingVolume?.tax_year ? `Network Filings (${filingVolume.tax_year})` : "Network Filings"} value={filingVolume ? Number(filingVolume.total_returns) : "--"} />
          </Link>
          <Link href="#partner-overview" className="block">
            <StatTile icon={TrendingUp} tone="emerald" label="Network Production" value={production ? money(production.network_production) : "--"} />
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
                      <li key={p.connection_id}>{p.partner_name}</li>
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

        {/* Network Production */}
        <SectionCard title="Network Production" accent="emerald">
          {productionError || !production ? (
            <SectionError label="network production" />
          ) : (
            <div className="flex flex-col items-start gap-1">
              <p className="font-display text-3xl font-semibold text-ink">{money(production.network_production)}</p>
              <p className="text-xs text-muted">
                {production.period_start} to {production.period_end} &middot; {production.connection_count} active connection
                {production.connection_count === 1 ? "" : "s"} &middot; {networkReturnVolume} return{networkReturnVolume === 1 ? "" : "s"}
              </p>
              {Number(production.network_production) === 0 && (
                <p className="text-xs text-muted">No network production for this period.</p>
              )}
              <Link href="#partner-overview" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                <TrendingUp size={12} aria-hidden="true" /> See partner-level production
              </Link>
            </div>
          )}
        </SectionCard>

        {/* Partner Overview */}
        <SectionCard
          title="Partner Overview"
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
          <div id="partner-overview" />
          {partnerProductionError ? (
            <SectionError label="partner overview" />
          ) : topPartners.length === 0 ? (
            <EmptyState icon={Building2} message="No active network partners yet." action={<Link href="/settings/users" className="text-xs font-medium text-accent hover:underline">Invite Partner</Link>} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                      <th className="px-3 py-2">Partner</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Return Volume</th>
                      <th className="px-3 py-2 text-right">Production</th>
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
                        <td className="px-3 py-2">
                          <Badge tone="success">Active</Badge>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate">{Number(p.return_volume)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate">{money(p.production)}</td>
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

        {/* Review Summary */}
        <SectionCard title="Review Summary" action={<Link href="/review-queue" className="text-xs font-medium text-accent hover:underline">Review Queue</Link>}>
          {reviewStatusError || !reviewStatus ? (
            <SectionError label="review summary" />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile icon={ClipboardCheck} tone="rose" label="Awaiting Review" value={awaitingReviewCount} />
                <StatTile icon={ClipboardCheck} tone="amber" label="Corrections Requested" value={reviewStatus.corrections_requested_count} />
                <StatTile icon={ClipboardCheck} tone="emerald" label="Approved" value={reviewStatus.approved_count} />
                <StatTile icon={ClipboardCheck} tone="accent" label="Rejected" value={reviewStatus.rejected_count} />
              </div>
              <p className="mt-3 text-[11px] text-muted">Awaiting Review includes both pending and corrections-requested filings -- the same total Review Queue shows as needing your action.</p>
            </>
          )}
        </SectionCard>

        {/* Financial Summary */}
        <SectionCard title="Financial Summary">
          {revenueShareError || payoutError ? (
            <SectionError label="financial summary" />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted">
            Network Revenue Share is calculated live for {production ? `${production.period_start} to ${production.period_end}` : "the selected period"}.
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

        {/* My Office */}
        <SectionCard title="My Office" action={<Link href="/dashboard" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">View My Office <ArrowRight size={12} aria-hidden="true" /></Link>}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile icon={Briefcase} tone="violet" label="Open Engagements" value={officeData.kpis.openEngagements} />
            <StatTile icon={Clock} tone={officeData.overdueTasks.length > 0 ? "rose" : "emerald"} label="Overdue Tasks" value={officeData.overdueTasks.length} />
            <StatTile icon={Receipt} tone={officeData.overdueInvoices.length > 0 ? "amber" : "emerald"} label="Overdue Invoices" value={officeData.overdueInvoices.length} />
            <StatTile icon={Users} tone="accent" label="Team Members" value={activeMemberCount} />
          </div>
        </SectionCard>

        {/* Quick Actions */}
        <SectionCard title="Quick Actions">
          <nav aria-label="Quick actions" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Invite Partner", href: "/settings/users", icon: UserPlus, chip: "bg-accentSoft text-accent" },
              { label: "Review Filing", href: "/review-queue", icon: ClipboardCheck, chip: "bg-roseSoft text-rose" },
              { label: "View Network", href: "/firms", icon: Building2, chip: "bg-violetSoft text-violet" },
              { label: "Manage Banks & Software", href: "/settings/bank-partners", icon: Wallet, chip: "bg-amberSoft text-amber" },
              { label: "Manage Training", href: "/learning/manage", icon: GraduationCap, chip: "bg-emeraldSoft text-emerald" },
              { label: "Network Messages", href: "/messages", icon: Send, chip: "bg-accentSoft text-accent" },
              { label: "View My Office", href: "/dashboard", icon: Briefcase, chip: "bg-violetSoft text-violet" },
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

        {partnersError && <SectionError label="connected partners" />}
      </div>
    </>
  );
}
