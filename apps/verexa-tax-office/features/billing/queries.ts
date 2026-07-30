import { createClient } from "@/lib/supabase/server";

export async function getInvoices(workspaceId: string, opts?: { status?: string; clientId?: string; engagementId?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("invoices")
    .select("*, client:clients(id, first_name, last_name, company), engagement:tax_engagements(id, engagement_number, title)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (opts?.status) query = query.eq("status", opts.status as never);
  if (opts?.clientId) query = query.eq("client_id", opts.clientId);
  if (opts?.engagementId) query = query.eq("engagement_id", opts.engagementId);
  const { data } = await query;
  return data ?? [];
}

export async function getOutstandingBalance(workspaceId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("balance_due")
    .eq("workspace_id", workspaceId)
    .not("status", "in", "(draft,void)");
  return (data ?? []).reduce((sum, i) => sum + Number(i.balance_due ?? 0), 0);
}

export async function getInvoiceDetail(invoiceId: string) {
  const supabase = await createClient();
  const [{ data: invoice }, { data: items }, { data: payments }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, client:clients(id, first_name, last_name, company), engagement:tax_engagements(id, engagement_number, title)")
      .eq("id", invoiceId)
      .maybeSingle(),
    supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("sort_order"),
    supabase.from("payments").select("*").eq("invoice_id", invoiceId).order("created_at", { ascending: false }),
  ]);
  return { invoice, items: items ?? [], payments: payments ?? [] };
}

export async function getPayments(workspaceId: string, opts?: { status?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("payments")
    .select("*, client:clients(id, first_name, last_name, company), invoice:invoices(id, invoice_number)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (opts?.status) query = query.eq("status", opts.status as never);
  const { data } = await query;
  return data ?? [];
}
