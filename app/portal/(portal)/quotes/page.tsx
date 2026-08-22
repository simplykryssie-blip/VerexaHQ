import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { getEffectiveBranding } from "@/lib/branding";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { InvoicePreview, type PreviewLineItem } from "@/components/billing/InvoicePreview";
import { PortalQuoteActions } from "@/components/portal/PortalQuoteActions";

export const dynamic = "force-dynamic";

export default async function PortalQuotesPage() {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  const [{ data: quotes }, branding] = await Promise.all([
    supabase
      .from("quotes")
      .select("*")
      .eq("client_id", identity.clientId)
      .neq("status", "draft")
      .order("created_at", { ascending: false }),
    getEffectiveBranding(identity.workspaceId),
  ]);

  const firmName = branding.displayName ?? "your firm";

  return (
    <>
      <PageHeader title="Quotes" description="Pricing your firm has sent you -- review and accept or decline." />
      <div className="flex-1 space-y-6 px-8 py-6">
        {(quotes ?? []).length === 0 ? (
          <EmptyState message="No quotes yet." />
        ) : (
          <div className="space-y-6">
            {(quotes ?? []).map((q) => (
              <div key={q.id} className="max-w-2xl">
                <InvoicePreview
                  kind="quote"
                  firmName={firmName}
                  clientName={identity.clientLabel}
                  number={q.quote_number}
                  issueDate={q.created_at}
                  dueDate={q.valid_until}
                  lineItems={(q.line_items as unknown as PreviewLineItem[]) ?? []}
                  subtotal={q.subtotal}
                  discountAmount={q.discount_amount}
                  taxAmount={q.tax_amount}
                  totalAmount={q.total_amount}
                  notes={q.notes}
                  status={q.status}
                />
                {q.status === "sent" && (
                  <div className="mt-3">
                    <PortalQuoteActions quoteId={q.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
