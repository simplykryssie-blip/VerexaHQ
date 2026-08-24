import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ShieldEllipsis, Lock, ShieldAlert, ArrowRight, Users, DollarSign, RefreshCw, CreditCard, Receipt } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { PlatformAdminsManager } from "./PlatformAdminsManager";
import { PlatformItManager } from "./PlatformItManager";
import { ProvisionWorkspaceForm } from "./ProvisionWorkspaceForm";
import { PlatformAdminTabs } from "./PlatformAdminTabs";
import { RangeSwitcher } from "@/components/dashboard/RangeSwitcher";
import { isDashboardRange } from "@/lib/dashboard/range";
import { getBusinessSnapshot } from "@/lib/dashboard/businessSnapshot";

function money(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const dynamic = "force-dynamic";

const WORKSPACE_TYPE_LABELS: Record<string, string> = {
  independent_ptin: "Independent PTIN",
  ero_office: "ERO Office",
  service_bureau: "Service Bureau",
  multi_office_firm: "Multi-Office Firm",
  platform_admin: "Platform Admin",
};

const STATUS_TONE: Record<string, BadgeTone> = {
  active: "success",
  suspended: "danger",
  archived: "neutral",
};

export default async function PlatformAdminPage({ searchParams }: { searchParams: { range?: string } }) {
  const supabase = createClient();
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");
  const range = isDashboardRange(searchParams.range) ? searchParams.range : "month";

  if (!isPlatformAdmin) {
    return (
      <>
        <PageHeader title="Platform Admin" />
        <div className="flex-1 px-8 py-6">
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState icon={Lock} message="This area is only available to Verexa platform admins." />
          </div>
        </div>
      </>
    );
  }

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  const [
    { data: workspaces },
    { data: subscriptions },
    { data: plans },
    { data: members },
    { data: admins },
    { data: itUsers },
    { data: owners },
    { data: staffDirectory },
    { count: undigestedFailureCount },
    { data: homeWorkspace },
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select("id, name, workspace_type, status, suspension_reason, is_demo, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("workspace_subscriptions").select("workspace_id, plan_id, stripe_status, cancel_at_period_end, seat_count, current_period_end"),
    supabase.from("platform_subscription_plans").select("id, name"),
    supabase.from("workspace_users").select("workspace_id, status"),
    supabase.from("user_profiles").select("id, display_name").eq("is_platform_admin", true).order("display_name"),
    supabase.from("user_profiles").select("id, display_name").eq("is_platform_it", true).order("display_name"),
    supabase.from("workspace_users").select("workspace_id, user_profiles(display_name)").eq("is_owner", true),
    supabase.rpc("get_platform_staff_directory"),
    supabase.from("system_failure_log").select("id", { count: "exact", head: true }).is("notified_at", null),
    supabase.from("workspaces").select("id").eq("is_platform_home", true).maybeSingle(),
  ]);

  const businessSnapshot = homeWorkspace ? await getBusinessSnapshot(homeWorkspace.id, range) : null;

  const planNameById = new Map((plans ?? []).map((p) => [p.id, p.name]));
  const subscriptionByWorkspace = new Map((subscriptions ?? []).map((s) => [s.workspace_id, s]));
  const staffCountByWorkspace = new Map<string, number>();
  for (const m of members ?? []) {
    if (m.status !== "active") continue;
    staffCountByWorkspace.set(m.workspace_id, (staffCountByWorkspace.get(m.workspace_id) ?? 0) + 1);
  }
  const ownerNameByWorkspace = new Map(
    (owners ?? []).map((o) => [o.workspace_id, (o.user_profiles as unknown as { display_name: string | null } | null)?.display_name ?? null])
  );

  const rows = workspaces ?? [];
  // Demo shells (Demo - Independent PTIN/ERO/SB) exist to show off the
  // product, not as customers -- they'd otherwise inflate every count here.
  const realRows = rows.filter((w) => !w.is_demo);
  const realWorkspaceIds = new Set(realRows.map((w) => w.id));
  const totalWorkspaces = realRows.length;
  const activeCount = realRows.filter((w) => w.status === "active").length;
  const suspendedCount = realRows.filter((w) => w.status === "suspended").length;
  const pendingCancellationCount = (subscriptions ?? []).filter(
    (s) => s.stripe_status === "active" && s.cancel_at_period_end && realWorkspaceIds.has(s.workspace_id)
  ).length;

  return (
    <>
      <PageHeader
        title="Platform Admin"
        description="Every workspace on Verexa -- subscription status, roster size, and connections, across all tenants."
      />
      <div className="flex-1 space-y-6 px-8 py-6">
        <PlatformAdminTabs active="overview" />

        <ProvisionWorkspaceForm />

        <div>
          <h2 className="mb-3 font-display text-sm font-semibold text-ink">Platform overview</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Total workspaces", value: totalWorkspaces },
              { label: "Active workspaces", value: activeCount },
              { label: "Suspended workspaces", value: suspendedCount },
              { label: "Pending cancellations", value: pendingCancellationCount },
            ].map((t) => (
              <div key={t.label} className="rounded-2xl border border-border bg-surface shadow-soft p-4">
                <p className="text-xs uppercase tracking-wide text-muted">{t.label}</p>
                <p className="mt-1 text-2xl font-semibold text-ink">{t.value}</p>
              </div>
            ))}
          </div>
        </div>

        {businessSnapshot && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-ink">Your practice -- {businessSnapshot.rangeLabel}</h2>
              <RangeSwitcher range={range} />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
                <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accentSoft text-accent">
                  <Users size={17} aria-hidden="true" />
                </span>
                <p className="text-xs uppercase tracking-wide text-muted">Active Customers</p>
                <p className="mt-1 text-2xl font-semibold text-ink">{businessSnapshot.activeCustomers}</p>
              </div>
              <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
                <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emeraldSoft text-emerald">
                  <DollarSign size={17} aria-hidden="true" />
                </span>
                <p className="text-xs uppercase tracking-wide text-muted">Revenue</p>
                <p className="mt-1 text-2xl font-semibold text-ink">{money(businessSnapshot.revenueInRange)}</p>
              </div>
              <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
                <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-violetSoft text-violet">
                  <RefreshCw size={17} aria-hidden="true" />
                </span>
                <p className="text-xs uppercase tracking-wide text-muted">Upcoming Renewals</p>
                <p className="mt-1 text-2xl font-semibold text-ink">
                  {businessSnapshot.upcomingRenewalsCount} ({money(businessSnapshot.upcomingRenewalsTotal)})
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
                <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-roseSoft text-rose">
                  <CreditCard size={17} aria-hidden="true" />
                </span>
                <p className="text-xs uppercase tracking-wide text-muted">Payment Failures</p>
                <p className="mt-1 text-2xl font-semibold text-ink">
                  {businessSnapshot.paymentFailuresOpen} open <span className="text-muted">/</span> {businessSnapshot.paymentFailuresClosed} closed
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
                <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amberSoft text-amber">
                  <Receipt size={17} aria-hidden="true" />
                </span>
                <p className="text-xs uppercase tracking-wide text-muted">Outstanding Invoices</p>
                <p className="mt-1 text-2xl font-semibold text-ink">{money(businessSnapshot.outstandingInvoicesTotal)}</p>
              </div>
            </div>
          </div>
        )}

        <Link
          href="/platform-admin/review"
          className="flex items-center justify-between rounded-2xl border border-border bg-surface shadow-soft p-4 transition hover:border-accent"
        >
          <span className="flex items-center gap-2">
            <ShieldAlert size={16} className={(undigestedFailureCount ?? 0) > 0 ? "text-danger" : "text-muted"} aria-hidden="true" />
            <span className="text-sm font-medium text-ink">
              {undigestedFailureCount ?? 0} undigested system failure{(undigestedFailureCount ?? 0) === 1 ? "" : "s"}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
            Review queue <ArrowRight size={12} aria-hidden="true" />
          </span>
        </Link>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState icon={ShieldEllipsis} message="No workspaces yet." />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Workspace</th>
                  <th className="px-5 py-3 font-medium">Account holder</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Subscription</th>
                  <th className="px-5 py-3 font-medium">Staff</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((w) => {
                  const sub = subscriptionByWorkspace.get(w.id);
                  const planName = sub ? planNameById.get(sub.plan_id) : null;
                  return (
                    <tr key={w.id} className="hover:bg-surfaceMuted">
                      <td className="px-5 py-3">
                        <Link href={`/platform-admin/${w.id}`} className="font-medium text-accent hover:underline">
                          {w.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate">{ownerNameByWorkspace.get(w.id) ?? <span className="text-muted">--</span>}</td>
                      <td className="px-5 py-3 text-slate">{WORKSPACE_TYPE_LABELS[w.workspace_type] ?? w.workspace_type}</td>
                      <td className="px-5 py-3">
                        <Badge tone={STATUS_TONE[w.status] ?? "neutral"} className="capitalize">
                          {w.status}
                        </Badge>
                        {w.suspension_reason && <span className="ml-1.5 text-xs text-muted">({w.suspension_reason.replace(/_/g, " ")})</span>}
                      </td>
                      <td className="px-5 py-3 text-slate">
                        {sub ? `${planName ?? "Plan"} -- ${sub.stripe_status}` : <span className="text-muted">No subscription</span>}
                      </td>
                      <td className="px-5 py-3 text-slate">{staffCountByWorkspace.get(w.id) ?? 0}</td>
                      <td className="px-5 py-3 text-slate">{new Date(w.created_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div>
          <h3 className="mb-1 font-display text-sm font-semibold text-ink">Staff</h3>
          <p className="mb-3 text-xs text-muted">Every active staff member across every workspace, most recently logged in first.</p>
          {!staffDirectory || staffDirectory.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface shadow-soft">
              <EmptyState icon={ShieldEllipsis} message="No staff yet." />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Email</th>
                    <th className="px-5 py-3 font-medium">Workspace</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                    <th className="px-5 py-3 font-medium">Last login</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {staffDirectory.map((s) => (
                    <tr key={`${s.workspace_id}-${s.user_id}`} className="hover:bg-surfaceMuted">
                      <td className="px-5 py-3 text-slate">{s.display_name ?? <span className="text-muted">--</span>}</td>
                      <td className="px-5 py-3 text-slate">{s.email}</td>
                      <td className="px-5 py-3">
                        <Link href={`/platform-admin/${s.workspace_id}`} className="font-medium text-accent hover:underline">
                          {s.workspace_name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate">{s.is_owner ? "Owner" : "Staff"}</td>
                      <td className="px-5 py-3 text-slate">
                        {s.last_sign_in_at ? new Date(s.last_sign_in_at).toLocaleString() : <span className="text-muted">Never</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className="font-display text-sm font-semibold text-ink">Platform admins</h3>
          <p className="mt-1 text-xs text-muted">
            Anyone here can see every workspace on Verexa and manage subscriptions, status, and other admins. Grant this carefully.
          </p>
          <div className="mt-3">
            <PlatformAdminsManager admins={admins ?? []} currentUserId={currentUser?.id ?? ""} />
          </div>
        </div>

        <div>
          <h3 className="font-display text-sm font-semibold text-ink">Platform IT</h3>
          <p className="mt-1 text-xs text-muted">
            IT tools access sees system failures, job queues, and the workspace roster for troubleshooting -- not billing or revenue, and can&apos;t grant
            admin or IT access to anyone else.
          </p>
          <div className="mt-3">
            <PlatformItManager itUsers={itUsers ?? []} />
          </div>
        </div>
      </div>
    </>
  );
}
