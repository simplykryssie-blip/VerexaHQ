import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Lock, Receipt, AlertTriangle, CreditCard } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { PlatformAdminTabs } from "../PlatformAdminTabs";
import { getCustomerDefaultPaymentMethod } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

const NEEDS_ATTENTION_STATUSES = new Set(["past_due", "unpaid", "incomplete_expired"]);

const STATUS_TONE: Record<string, BadgeTone> = {
  active: "success",
  trialing: "success",
  past_due: "warning",
  unpaid: "danger",
  incomplete_expired: "danger",
  canceled: "neutral",
};

const INVOICE_STATUS_TONE: Record<string, BadgeTone> = {
  paid: "success",
  open: "warning",
  uncollectible: "danger",
  void: "neutral",
};

function formatCents(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default async function PlatformAdminBillingPage() {
  const supabase = createClient();
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");

  if (!isPlatformAdmin) {
    return (
      <>
        <PageHeader title="Platform Billing" />
        <div className="flex-1 px-8 py-6">
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState icon={Lock} message="This area is only available to Verexa platform admins." />
          </div>
        </div>
      </>
    );
  }

  const [{ data: subscriptions }, { data: plans }, { data: workspaces }, { data: invoices }, { data: paidInvoices }] = await Promise.all([
    supabase
      .from("workspace_subscriptions")
      .select("workspace_id, plan_id, stripe_status, stripe_customer_id, seat_count, current_period_end"),
    supabase.from("platform_subscription_plans").select("id, name, base_price_cents, included_seats, per_seat_price_cents"),
    supabase.from("workspaces").select("id, name"),
    supabase
      .from("workspace_subscription_invoices")
      .select("id, workspace_id, amount_due, amount_paid, status, period_start, period_end, hosted_invoice_url, created_at")
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("workspace_subscription_invoices")
      .select("workspace_id, amount_paid, paid_at")
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(100),
  ]);

  const planById = new Map((plans ?? []).map((p) => [p.id, p]));
  const workspaceNameById = new Map((workspaces ?? []).map((w) => [w.id, w.name]));
  const subs = subscriptions ?? [];

  // First row per workspace wins since paidInvoices is already ordered
  // most-recent-first -- that's this workspace's last payment.
  const lastPaymentByWorkspace = new Map<string, { amount_paid: number; paid_at: string | null }>();
  for (const inv of paidInvoices ?? []) {
    if (!lastPaymentByWorkspace.has(inv.workspace_id)) {
      lastPaymentByWorkspace.set(inv.workspace_id, { amount_paid: inv.amount_paid, paid_at: inv.paid_at });
    }
  }

  // Checked live against Stripe rather than cached -- there's no local copy
  // of card details anywhere in the schema, and this only runs for however
  // many workspaces actually have a subscription (a handful, not a scale
  // concern for a per-page-load call).
  const paymentMethodByCustomer = new Map<string, { brand: string; last4: string; expMonth: number; expYear: number } | null>();
  await Promise.all(
    Array.from(new Set(subs.map((s) => s.stripe_customer_id).filter((id): id is string => Boolean(id)))).map(async (customerId) => {
      const result = await getCustomerDefaultPaymentMethod(customerId);
      paymentMethodByCustomer.set(customerId, result.ok ? result.data : null);
    })
  );

  // An estimate, not a true MRR figure -- it prices the plan base + any seats
  // beyond what's included, but leaves out metered overages (email/SMS/storage),
  // which only Stripe knows the actual usage for.
  let estimatedMonthlyCents = 0;
  const revenueByPlan = new Map<string, { name: string; workspaceCount: number; cents: number }>();
  const estimatedCentsByWorkspace = new Map<string, number>();
  for (const s of subs) {
    const plan = planById.get(s.plan_id);
    if (!plan) continue;
    const extraSeats = Math.max(0, s.seat_count - plan.included_seats);
    const cents = plan.base_price_cents + extraSeats * plan.per_seat_price_cents;
    estimatedCentsByWorkspace.set(s.workspace_id, cents);
    if (s.stripe_status !== "active" && s.stripe_status !== "trialing") continue;
    estimatedMonthlyCents += cents;
    const entry = revenueByPlan.get(plan.id) ?? { name: plan.name, workspaceCount: 0, cents: 0 };
    entry.workspaceCount += 1;
    entry.cents += cents;
    revenueByPlan.set(plan.id, entry);
  }

  const activeCount = subs.filter((s) => s.stripe_status === "active").length;
  const trialingCount = subs.filter((s) => s.stripe_status === "trialing").length;
  const needsAttention = subs.filter((s) => NEEDS_ATTENTION_STATUSES.has(s.stripe_status));

  return (
    <>
      <PageHeader
        title="Platform Billing"
        description="What Verexa is collecting from workspaces -- estimated recurring revenue, invoice history, and accounts that need follow-up."
      />
      <div className="flex-1 space-y-6 px-8 py-6">
        <PlatformAdminTabs active="billing" />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Est. monthly recurring", value: formatCents(estimatedMonthlyCents) },
            { label: "Active", value: activeCount },
            { label: "Trialing", value: trialingCount },
            { label: "Needs attention", value: needsAttention.length },
          ].map((t) => (
            <div key={t.label} className="rounded-2xl border border-border bg-surface shadow-soft p-4">
              <p className="text-xs uppercase tracking-wide text-muted">{t.label}</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{t.value}</p>
            </div>
          ))}
        </div>

        <div>
          <h3 className="mb-1 font-display text-sm font-semibold text-ink">Workspace subscriptions</h3>
          <p className="mb-3 text-xs text-muted">Every workspace with a subscription -- what they owe, whether a card is on file, and when they last paid.</p>
          {subs.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface shadow-soft">
              <EmptyState icon={Receipt} message="No workspace has been put on a paid plan yet." />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 font-medium">Workspace</th>
                    <th className="px-5 py-3 font-medium">Plan</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Est. amount</th>
                    <th className="px-5 py-3 font-medium">Card on file</th>
                    <th className="px-5 py-3 font-medium">Last payment</th>
                    <th className="px-5 py-3 font-medium">Next payment due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {subs.map((s) => {
                    const plan = planById.get(s.plan_id);
                    const lastPayment = lastPaymentByWorkspace.get(s.workspace_id);
                    const card = s.stripe_customer_id ? paymentMethodByCustomer.get(s.stripe_customer_id) : undefined;
                    return (
                      <tr key={s.workspace_id} className="transition-colors hover:bg-surfaceMuted">
                        <td className="px-5 py-3">
                          <Link href={`/platform-admin/${s.workspace_id}`} className="font-medium text-accent hover:underline">
                            {workspaceNameById.get(s.workspace_id) ?? s.workspace_id}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-slate">{plan?.name ?? <span className="text-muted">--</span>}</td>
                        <td className="px-5 py-3">
                          <Badge tone={STATUS_TONE[s.stripe_status] ?? "neutral"} className="capitalize">
                            {s.stripe_status.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-slate">{formatCents(estimatedCentsByWorkspace.get(s.workspace_id) ?? 0)}</td>
                        <td className="px-5 py-3 text-slate">
                          {!s.stripe_customer_id ? (
                            <span className="text-muted">--</span>
                          ) : card ? (
                            <span className="inline-flex items-center gap-1 capitalize">
                              <CreditCard size={12} /> {card.brand} •••• {card.last4}
                            </span>
                          ) : (
                            <span className="text-danger">No card on file</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate">
                          {lastPayment ? (
                            <>
                              {formatCents(lastPayment.amount_paid)}
                              {lastPayment.paid_at && <span className="text-muted"> -- {new Date(lastPayment.paid_at).toLocaleDateString()}</span>}
                            </>
                          ) : (
                            <span className="text-muted">--</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate">
                          {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : <span className="text-muted">--</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-ink">Revenue by plan</h3>
          <Link
            href="/platform-admin/plans"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent"
          >
            <Receipt size={14} /> Manage plan catalog
          </Link>
        </div>
        {revenueByPlan.size === 0 ? (
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState icon={Receipt} message="No active or trialing subscriptions yet." />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Workspaces</th>
                  <th className="px-5 py-3 font-medium">Est. monthly</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Array.from(revenueByPlan.values()).map((r) => (
                  <tr key={r.name} className="transition-colors hover:bg-surfaceMuted">
                    <td className="px-5 py-3 text-slate">{r.name}</td>
                    <td className="px-5 py-3 text-slate">{r.workspaceCount}</td>
                    <td className="px-5 py-3 text-slate">{formatCents(r.cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {needsAttention.length > 0 && (
          <div>
            <h3 className="mb-3 flex items-center gap-1.5 font-display text-sm font-semibold text-ink">
              <AlertTriangle size={14} className="text-warning" /> Needs attention
            </h3>
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 font-medium">Workspace</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Current period ends</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {needsAttention.map((s) => (
                    <tr key={s.workspace_id} className="transition-colors hover:bg-surfaceMuted">
                      <td className="px-5 py-3">
                        <Link href={`/platform-admin/${s.workspace_id}`} className="font-medium text-accent hover:underline">
                          {workspaceNameById.get(s.workspace_id) ?? s.workspace_id}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={STATUS_TONE[s.stripe_status] ?? "neutral"} className="capitalize">
                          {s.stripe_status.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-slate">
                        {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : <span className="text-muted">--</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-3 font-display text-sm font-semibold text-ink">Recent invoices</h3>
          {!invoices || invoices.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface shadow-soft">
              <EmptyState icon={Receipt} message="No invoices yet." />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 font-medium">Workspace</th>
                    <th className="px-5 py-3 font-medium">Amount</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Period</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="transition-colors hover:bg-surfaceMuted">
                      <td className="px-5 py-3">
                        <Link href={`/platform-admin/${inv.workspace_id}`} className="font-medium text-accent hover:underline">
                          {workspaceNameById.get(inv.workspace_id) ?? inv.workspace_id}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate">
                        {formatCents(inv.amount_paid)} / {formatCents(inv.amount_due)}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={INVOICE_STATUS_TONE[inv.status] ?? "neutral"} className="capitalize">
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-slate">
                        {inv.period_start && inv.period_end
                          ? `${new Date(inv.period_start).toLocaleDateString()} - ${new Date(inv.period_end).toLocaleDateString()}`
                          : <span className="text-muted">--</span>}
                      </td>
                      <td className="px-5 py-3 text-slate">{new Date(inv.created_at).toLocaleDateString()}</td>
                      <td className="px-5 py-3">
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
      </div>
    </>
  );
}
