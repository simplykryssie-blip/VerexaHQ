import Link from "next/link";
import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { getPortalContext } from "@/lib/auth/portal";
import { getInvoices } from "@/features/billing/queries";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { invoiceStatusLabel } from "@/lib/validation/billing";
import { formatCurrency, formatDate } from "@/lib/formatters";

export default async function PortalInvoicesPage() {
  const context = await getPortalContext();
  if (!context) redirect("/portal/sign-in");

  const invoices = await getInvoices(context.client.workspace_id, { clientId: context.client.id });
  const visible = invoices.filter((i) => i.status !== "draft");
  const outstanding = visible.reduce((sum, i) => sum + Number(i.balance_due ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="text-sm text-muted-foreground mt-1">Payment provider: not connected — pay by whatever method your tax office arranges with you.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-md">
        <StatCard label="Balance due" value={formatCurrency(outstanding)} icon={Receipt} tone={outstanding > 0 ? "warning" : "success"} />
        <StatCard label="Invoices" value={visible.length} icon={Receipt} />
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Receipt} title="No invoices yet" description="Invoices from your tax office will appear here." />
      ) : (
        <div className="space-y-2">
          {visible.map((inv) => (
            <Link key={inv.id} href={`/portal/invoices/${inv.id}`}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium">Invoice {inv.invoice_number}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Issued {formatDate(inv.issue_date)} · Due {formatDate(inv.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{formatCurrency(inv.balance_due)} due</span>
                    <Badge variant={inv.status === "paid" ? "success" : inv.status === "past_due" ? "destructive" : "secondary"}>{invoiceStatusLabel(inv.status)}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
