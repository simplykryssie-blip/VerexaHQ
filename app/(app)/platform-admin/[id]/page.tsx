import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";
import { WorkspaceStatusActions, AssignSubscriptionForm } from "./WorkspaceAdminActions";

export const dynamic = "force-dynamic";

const WORKSPACE_TYPE_LABELS: Record<string, string> = {
  independent_ptin: "Independent PTIN",
  ero_office: "ERO Office",
  service_bureau: "Service Bureau",
  multi_office_firm: "Multi-Office Firm",
  platform_admin: "Platform Admin",
};

function money(cents: number | null) {
  if (cents == null) return "--";
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function PlatformAdminWorkspaceDetailPage({ params }: { params: { id: string } }) {
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

  const { data: workspace } = await supabase
    .from("workspaces")
    .select(
      "id, name, workspace_type, status, suspension_reason, created_at, phone, website, mailing_address, primary_contact_email, stripe_connect_status"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!workspace) notFound();

  const [{ data: subscription }, { data: invoices }, { data: billingAdmin }, { data: staff }, { data: asParent }, { data: asChild }, { data: plans }] =
    await Promise.all([
      supabase
        .from("workspace_subscriptions")
        .select("plan_id, stripe_status, seat_count, current_period_start, current_period_end, trial_end, platform_subscription_plans(name, base_price_cents, per_seat_price_cents)")
        .eq("workspace_id", workspace.id)
        .maybeSingle(),
      supabase
        .from("workspace_subscription_invoices")
        .select("id, amount_due, amount_paid, status, period_start, period_end, paid_at, hosted_invoice_url")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase.rpc("get_workspace_billing_admin", { p_workspace_id: workspace.id }),
      supabase
        .from("workspace_users")
        .select("id, status, is_owner, user_profiles(display_name, avatar_url), roles(name)")
        .eq("workspace_id", workspace.id)
        .order("created_at" as never, { ascending: true }),
      supabase
        .from("firm_connections")
        .select("id, status, relationship_type, workspaces:child_workspace_id(id, name)")
        .eq("parent_workspace_id", workspace.id)
        .eq("relationship_type", "ero_ptin"),
      supabase
        .from("firm_connections")
        .select("id, status, relationship_type, workspaces:parent_workspace_id(id, name)")
        .eq("child_workspace_id", workspace.id)
        .eq("relationship_type", "ero_ptin"),
      supabase.from("platform_subscription_plans").select("id, name").eq("is_active", true).order("name"),
    ]);

  const plan = subscription?.platform_subscription_plans as unknown as {
    name: string;
    base_price_cents: number;
    per_seat_price_cents: number;
  } | null;
  const billingContact = (billingAdmin ?? [])[0] as { user_id: string; email: string } | undefined;

  return (
    <>
      <PageHeader backHref="/platform-admin" backLabel="Back to all workspaces" title={workspace.name} description={WORKSPACE_TYPE_LABELS[workspace.workspace_type] ?? workspace.workspace_type} />
      <div className="flex-1 space-y-8 px-8 py-6">
        <div>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-sm font-semibold text-ink">Workspace</h3>
            <WorkspaceStatusActions workspaceId={workspace.id} status={workspace.status} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-4 rounded-2xl border border-border bg-surface shadow-soft p-5 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Status</dt>
              <dd className="mt-0.5 capitalize text-slate">{workspace.status}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Suspension reason</dt>
              <dd className="mt-0.5 text-slate">{workspace.suspension_reason?.replace(/_/g, " ") ?? "--"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Created</dt>
              <dd className="mt-0.5 text-slate">{new Date(workspace.created_at).toLocaleDateString()}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Contact email</dt>
              <dd className="mt-0.5 text-slate">{workspace.primary_contact_email ?? "--"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Phone</dt>
              <dd className="mt-0.5 text-slate">{workspace.phone ?? "--"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Billing contact</dt>
              <dd className="mt-0.5 text-slate">{billingContact?.email ?? "--"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Stripe Connect (payments)</dt>
              <dd className="mt-0.5 capitalize text-slate">{workspace.stripe_connect_status?.replace(/_/g, " ") ?? "--"}</dd>
            </div>
          </dl>
        </div>

        <div>
          <h3 className="font-display text-sm font-semibold text-ink">Verexa subscription</h3>
          {!subscription ? (
            <div className="mt-3 rounded-2xl border border-border bg-surface shadow-soft">
              <EmptyState message="No Verexa subscription on file for this workspace." />
            </div>
          ) : (
            <dl className="mt-3 grid grid-cols-2 gap-4 rounded-2xl border border-border bg-surface shadow-soft p-5 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Plan</dt>
                <dd className="mt-0.5 text-slate">{plan?.name ?? "--"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Status</dt>
                <dd className="mt-0.5 capitalize text-slate">{subscription.stripe_status ?? "--"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Seats</dt>
                <dd className="mt-0.5 text-slate">{subscription.seat_count ?? "--"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Current period ends</dt>
                <dd className="mt-0.5 text-slate">
                  {subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "--"}
                </dd>
              </div>
            </dl>
          )}
          <div className="mt-3 rounded-2xl border border-border bg-surface shadow-soft p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {subscription ? "Change plan" : "Assign a plan"}
            </p>
            <AssignSubscriptionForm
              workspaceId={workspace.id}
              plans={plans ?? []}
              currentPlanId={subscription?.plan_id ?? null}
              currentStatus={subscription?.stripe_status ?? null}
              currentSeatCount={subscription?.seat_count ?? null}
            />
          </div>
        </div>

        <div>
          <h3 className="font-display text-sm font-semibold text-ink">Invoices</h3>
          {!invoices || invoices.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-border bg-surface shadow-soft">
              <EmptyState message="No invoices yet." />
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 font-medium">Period</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Due</th>
                    <th className="px-5 py-3 font-medium">Paid</th>
                    <th className="px-5 py-3 font-medium">Paid on</th>
                    <th className="px-5 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-5 py-3 text-slate">
                        {inv.period_start ? new Date(inv.period_start).toLocaleDateString() : "--"} -{" "}
                        {inv.period_end ? new Date(inv.period_end).toLocaleDateString() : "--"}
                      </td>
                      <td className="px-5 py-3 capitalize text-slate">{inv.status}</td>
                      <td className="px-5 py-3 text-slate">{money(inv.amount_due)}</td>
                      <td className="px-5 py-3 text-slate">{money(inv.amount_paid)}</td>
                      <td className="px-5 py-3 text-slate">{inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : "--"}</td>
                      <td className="px-5 py-3 text-right">
                        {inv.hosted_invoice_url && (
                          <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-accent hover:underline">
                            View
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className="font-display text-sm font-semibold text-ink">Staff ({(staff ?? []).filter((s) => s.status === "active").length})</h3>
          <div className="mt-3 rounded-2xl border border-border bg-surface shadow-soft">
            {!staff || staff.length === 0 ? (
              <EmptyState message="No staff on this workspace." />
            ) : (
              <ul className="divide-y divide-border">
                {staff.map((s) => {
                  const profile = s.user_profiles as unknown as { display_name: string | null; avatar_url: string | null } | null;
                  const role = s.roles as unknown as { name: string } | null;
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Avatar name={profile?.display_name} url={profile?.avatar_url} size="sm" />
                        <span className="text-slate">{profile?.display_name ?? "--"}</span>
                        {s.is_owner && <span className="text-xs text-accent">Owner</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted">
                        <span>{role?.name ?? "--"}</span>
                        <span className="capitalize">{s.status}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {((asParent && asParent.length > 0) || (asChild && asChild.length > 0)) && (
          <div>
            <h3 className="font-display text-sm font-semibold text-ink">Firm connections</h3>
            <div className="mt-3 rounded-2xl border border-border bg-surface shadow-soft">
              <ul className="divide-y divide-border text-sm">
                {(asParent ?? []).map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-5 py-3">
                    <span className="text-slate">
                      Connected PTIN: {(c.workspaces as unknown as { name: string } | null)?.name ?? "--"}
                    </span>
                    <span className="text-xs capitalize text-muted">{c.status}</span>
                  </li>
                ))}
                {(asChild ?? []).map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-5 py-3">
                    <span className="text-slate">Connected to ERO: {(c.workspaces as unknown as { name: string } | null)?.name ?? "--"}</span>
                    <span className="text-xs capitalize text-muted">{c.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
