import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Lock } from "lucide-react";
import { BillingHub, type BillingQuoteRow, type BillingInvoiceRow, type BillingPaymentRow, type BillingBankProductRow } from "@/components/billing/BillingHub";

export const dynamic = "force-dynamic";

function clientLabel(c: { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null } | null) {
  if (!c) return "--";
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export default async function BillingPage({ searchParams }: { searchParams: { filter?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: canView } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "billing.view" });

  if (!canView) {
    return (
      <>
        <PageHeader title="Billing" />
        <div className="flex-1 px-8 py-6">
          <EmptyState icon={Lock} message="You don't have permission to view billing." />
        </div>
      </>
    );
  }

  const [{ data: canManage }, { data: quotesRaw }, { data: invoicesRaw }, { data: paymentsRaw }, { data: bankProductsRaw }, { data: services }, { data: firmConnRows }] =
    await Promise.all([
      supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "billing.manage" }),
      supabase
        .from("quotes")
        .select(
          "id, quote_number, title, status, total_amount, subtotal, discount_amount, tax_amount, line_items, created_at, valid_until, notes, client_id, clients(first_name, last_name, business_name, client_type)"
        )
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("invoices")
        .select(
          "id, invoice_number, status, total_amount, amount_paid, subtotal, discount_amount, tax_amount, line_items, issue_date, due_date, notes, client_id, firm_connection_id, clients(first_name, last_name, business_name, client_type)"
        )
        .eq("workspace_id", workspace.id)
        .order("issue_date", { ascending: false }),
      supabase
        .from("payments")
        .select("id, status, amount, payment_date, payment_method, client_id, firm_connection_id, clients(first_name, last_name, business_name, client_type)")
        .eq("workspace_id", workspace.id)
        .order("payment_date", { ascending: false })
        .limit(200),
      supabase
        .from("bank_product_transactions")
        .select(
          "id, bank_partner, product_type, rebate_amount, status, created_at, engagement_id, engagements(engagement_number, client_id, clients(first_name, last_name, business_name, client_type))"
        )
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("services").select("id, name").or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`).eq("status", "published").order("display_order"),
      supabase.from("firm_connections").select("id, manual_name, child_workspace_id").eq("parent_workspace_id", workspace.id),
    ]);

  const childWorkspaceIds = (firmConnRows ?? []).map((f) => f.child_workspace_id).filter((id): id is string => Boolean(id));
  const { data: firmWorkspaceRows } = childWorkspaceIds.length
    ? await supabase.from("workspaces").select("id, name").in("id", childWorkspaceIds)
    : { data: [] as { id: string; name: string }[] };
  const workspaceNameById = new Map((firmWorkspaceRows ?? []).map((w) => [w.id, w.name]));
  const firmNameByConnectionId = new Map(
    (firmConnRows ?? []).map((f) => [f.id, (f.child_workspace_id && workspaceNameById.get(f.child_workspace_id)) || f.manual_name || "Connected firm"])
  );

  const quotes: BillingQuoteRow[] = (quotesRaw ?? []).map((q) => ({
    id: q.id,
    quote_number: q.quote_number,
    title: q.title,
    status: q.status,
    total_amount: q.total_amount,
    subtotal: q.subtotal,
    discount_amount: q.discount_amount,
    tax_amount: q.tax_amount,
    line_items: (q.line_items as never) ?? [],
    created_at: q.created_at,
    valid_until: q.valid_until,
    notes: q.notes,
    client_id: q.client_id,
    client_name: clientLabel(q.clients as never),
  }));

  const invoices: BillingInvoiceRow[] = (invoicesRaw ?? []).map((i) => ({
    id: i.id,
    invoice_number: i.invoice_number,
    status: i.status,
    total_amount: i.total_amount,
    amount_paid: i.amount_paid,
    subtotal: i.subtotal,
    discount_amount: i.discount_amount,
    tax_amount: i.tax_amount,
    line_items: (i.line_items as never) ?? [],
    issue_date: i.issue_date,
    due_date: i.due_date,
    notes: i.notes,
    client_id: i.client_id,
    firm_connection_id: i.firm_connection_id,
    client_name: i.client_id ? clientLabel(i.clients as never) : (firmNameByConnectionId.get(i.firm_connection_id ?? "") ?? "Connected firm"),
  }));

  const payments: BillingPaymentRow[] = (paymentsRaw ?? []).map((p) => ({
    id: p.id,
    status: p.status,
    amount: p.amount,
    payment_date: p.payment_date,
    payment_method: p.payment_method,
    client_id: p.client_id,
    firm_connection_id: p.firm_connection_id,
    client_name: p.client_id ? clientLabel(p.clients as never) : (firmNameByConnectionId.get(p.firm_connection_id ?? "") ?? "Connected firm"),
  }));

  const bankProducts: BillingBankProductRow[] = (bankProductsRaw ?? []).map((b) => {
    const engagement = b.engagements as unknown as { engagement_number: string | null; client_id: string; clients: never } | null;
    return {
      id: b.id,
      bank_partner: b.bank_partner,
      product_type: b.product_type,
      rebate_amount: b.rebate_amount,
      status: b.status,
      created_at: b.created_at,
      engagement_id: b.engagement_id,
      engagement_number: engagement?.engagement_number ?? null,
      client_id: engagement?.client_id ?? "",
      client_name: engagement ? clientLabel(engagement.clients) : "--",
    };
  });

  return (
    <>
      <PageHeader title="Billing" description="Quotes, invoices, and payments across every client -- for trends and history, see Reports > Financial." />
      <div className="flex-1 px-8 py-6">
        <BillingHub
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          quotes={quotes}
          invoices={invoices}
          payments={payments}
          bankProducts={bankProducts}
          services={services ?? []}
          canManage={Boolean(canManage)}
          initialUnpaidOnly={searchParams.filter === "unpaid"}
        />
      </div>
    </>
  );
}
