import { createClient } from "@/lib/supabase/server";
import { getRangeBounds, type DashboardRange } from "@/lib/dashboard/range";

export type BusinessSnapshot = {
  activeCustomers: number;
  revenueInRange: number;
  outstandingInvoicesTotal: number;
  outstandingInvoicesCount: number;
  upcomingRenewalsCount: number;
  upcomingRenewalsTotal: number;
  paymentFailuresOpen: number;
  paymentFailuresClosed: number;
  rangeLabel: string;
};

/**
 * Verexa HQ CRM's own business numbers (it's a real independent-PTIN
 * practice, not just the platform's operator console) -- shown on the
 * platform-admin dashboard for that one workspace, distinct from every
 * other workspace's regular per-workspace dashboard.
 */
export async function getBusinessSnapshot(workspaceId: string, range: DashboardRange): Promise<BusinessSnapshot> {
  const supabase = createClient();
  const { start: rangeStart, end: rangeEnd, label: rangeLabel } = getRangeBounds(range);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const renewalsWindowStart = startOfToday < rangeEnd ? startOfToday : rangeEnd;

  const [
    { count: activeCustomers },
    { data: payments },
    { data: invoices },
    { data: upcomingRenewals },
    { data: failedPayments },
  ] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("lifecycle_status", "active"),
    supabase
      .from("payments")
      .select("amount")
      .eq("workspace_id", workspaceId)
      .eq("status", "succeeded")
      .gte("payment_date", rangeStart.toISOString())
      .lt("payment_date", rangeEnd.toISOString()),
    supabase
      .from("invoices")
      .select("id, total_amount, amount_paid")
      .eq("workspace_id", workspaceId)
      .not("status", "in", '("paid","void","draft")'),
    supabase
      .from("recurring_billing")
      .select("id, amount, next_billing_date")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .gte("next_billing_date", renewalsWindowStart.toISOString().slice(0, 10))
      .lte("next_billing_date", rangeEnd.toISOString().slice(0, 10)),
    supabase
      .from("payments")
      .select("id, invoice_id, invoices(status)")
      .eq("workspace_id", workspaceId)
      .eq("status", "failed")
      .gte("payment_date", rangeStart.toISOString())
      .lt("payment_date", rangeEnd.toISOString()),
  ]);

  const invoiceRows = invoices ?? [];
  const paymentFailuresClosed = (failedPayments ?? []).filter(
    (p) => (p.invoices as unknown as { status: string } | null)?.status === "paid"
  ).length;

  return {
    activeCustomers: activeCustomers ?? 0,
    revenueInRange: (payments ?? []).reduce((sum, p) => sum + p.amount, 0),
    outstandingInvoicesTotal: invoiceRows.reduce((sum, i) => sum + (i.total_amount - i.amount_paid), 0),
    outstandingInvoicesCount: invoiceRows.length,
    upcomingRenewalsCount: (upcomingRenewals ?? []).length,
    upcomingRenewalsTotal: (upcomingRenewals ?? []).reduce((sum, r) => sum + r.amount, 0),
    paymentFailuresOpen: (failedPayments ?? []).length - paymentFailuresClosed,
    paymentFailuresClosed,
    rangeLabel,
  };
}
