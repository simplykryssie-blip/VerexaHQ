import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { PortalPayButton } from "@/components/portal/PortalPayButton";

export const dynamic = "force-dynamic";

function money(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function PortalBillingPage() {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  const [{ data: invoices }, { data: payments }, { data: ledgerEntries }] = await Promise.all([
    supabase.from("invoices").select("*").eq("client_id", identity.clientId).order("issue_date", { ascending: false }),
    supabase.from("payments").select("*").eq("client_id", identity.clientId).order("payment_date", { ascending: false }),
    supabase.from("client_ledger").select("balance_after").eq("client_id", identity.clientId).order("created_at", { ascending: false }).limit(1),
  ]);

  const outstandingBalance = ledgerEntries && ledgerEntries.length > 0 ? ledgerEntries[0].balance_after : 0;

  return (
    <>
      <PageHeader title="Billing" description="Invoices and payment history." />
      <div className="flex-1 space-y-6 px-8 py-6">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Balance due</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{money(outstandingBalance)}</p>
        </div>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink">Invoices</h2>
          {(invoices ?? []).length === 0 ? (
            <EmptyState message="No invoices yet." />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {(invoices ?? []).map((inv) => {
                const balance = inv.total_amount - inv.amount_paid;
                return (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-slate">{inv.invoice_number ?? "Invoice"}</p>
                      <p className="text-xs text-muted">
                        Issued {new Date(inv.issue_date).toLocaleDateString()}
                        {inv.due_date && ` -- due ${new Date(inv.due_date).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs capitalize text-muted">{inv.status}</span>
                      <span className="font-medium text-ink">{money(inv.total_amount)}</span>
                      {balance > 0 && inv.status !== "draft" && <PortalPayButton invoiceId={inv.id} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink">Payment history</h2>
          {(payments ?? []).length === 0 ? (
            <EmptyState message="No payments recorded yet." />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {(payments ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-slate">{new Date(p.payment_date).toLocaleDateString()}</span>
                  <span className="text-xs capitalize text-muted">{p.status}</span>
                  <span className="font-medium text-ink">{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
