import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ShieldEllipsis, Lock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { PlatformAdminsManager } from "./PlatformAdminsManager";
import { PlatformItManager } from "./PlatformItManager";
import { ProvisionWorkspaceForm } from "./ProvisionWorkspaceForm";
import { PlatformAdminTabs } from "./PlatformAdminTabs";

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

export default async function PlatformAdminPage() {
  const supabase = createClient();
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");

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

  const [{ data: workspaces }, { data: subscriptions }, { data: plans }, { data: members }, { data: admins }, { data: itUsers }, { data: owners }, { data: staffDirectory }] =
    await Promise.all([
      supabase.from("workspaces").select("id, name, workspace_type, status, suspension_reason, created_at").order("created_at", { ascending: false }),
      supabase.from("workspace_subscriptions").select("workspace_id, plan_id, stripe_status, seat_count, current_period_end"),
      supabase.from("platform_subscription_plans").select("id, name"),
      supabase.from("workspace_users").select("workspace_id, status"),
      supabase.from("user_profiles").select("id, display_name").eq("is_platform_admin", true).order("display_name"),
      supabase.from("user_profiles").select("id, display_name").eq("is_platform_it", true).order("display_name"),
      supabase.from("workspace_users").select("workspace_id, user_profiles(display_name)").eq("is_owner", true),
      supabase.rpc("get_platform_staff_directory"),
    ]);

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
  const totalWorkspaces = rows.length;
  const suspendedCount = rows.filter((w) => w.status === "suspended").length;
  const activeSubscriptionCount = (subscriptions ?? []).filter((s) => s.stripe_status === "active" || s.stripe_status === "trialing").length;
  // Sum only workspaces that still exist -- workspace_users can carry orphaned
  // rows pointing at a deleted workspace_id (a real one caused "Total staff"
  // to overcount before), so this deliberately doesn't just sum every entry
  // in staffCountByWorkspace.
  const totalStaff = rows.reduce((sum, w) => sum + (staffCountByWorkspace.get(w.id) ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Platform Admin"
        description="Every workspace on Verexa -- subscription status, roster size, and connections, across all tenants."
      />
      <div className="flex-1 space-y-6 px-8 py-6">
        <PlatformAdminTabs active="overview" />

        <ProvisionWorkspaceForm />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Workspaces", value: totalWorkspaces },
            { label: "Active subscriptions", value: activeSubscriptionCount },
            { label: "Suspended", value: suspendedCount },
            { label: "Total staff", value: totalStaff },
          ].map((t) => (
            <div key={t.label} className="rounded-2xl border border-border bg-surface shadow-soft p-4">
              <p className="text-xs uppercase tracking-wide text-muted">{t.label}</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{t.value}</p>
            </div>
          ))}
        </div>

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
