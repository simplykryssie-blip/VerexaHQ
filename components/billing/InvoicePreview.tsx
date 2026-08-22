function money(n: number) {
  return `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type PreviewLineItem = { description: string; quantity: number; unit_price: number };

export function InvoicePreview({
  kind,
  firmName,
  clientName,
  number,
  issueDate,
  dueDate,
  lineItems,
  subtotal,
  discountAmount,
  taxAmount,
  totalAmount,
  notes,
  status,
}: {
  kind: "invoice" | "quote";
  firmName: string;
  clientName: string;
  number: string | null;
  issueDate: string | null;
  dueDate: string | null;
  lineItems: PreviewLineItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string | null;
  status?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-8 text-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-base font-semibold text-ink">{firmName}</p>
          <p className="mt-1 text-muted">Bill to: {clientName}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold uppercase tracking-wide text-ink">{kind === "invoice" ? "Invoice" : "Quote"}</p>
          {number && <p className="mt-1 text-muted">{number}</p>}
          {status && <p className="mt-0.5 capitalize text-muted">{status}</p>}
        </div>
      </div>

      <div className="mt-6 flex gap-8 text-xs text-muted">
        {issueDate && (
          <div>
            <p className="uppercase tracking-wide">{kind === "invoice" ? "Issue date" : "Date"}</p>
            <p className="mt-0.5 text-sm text-slate">{new Date(issueDate).toLocaleDateString()}</p>
          </div>
        )}
        {dueDate && (
          <div>
            <p className="uppercase tracking-wide">{kind === "invoice" ? "Due date" : "Valid until"}</p>
            <p className="mt-0.5 text-sm text-slate">{new Date(dueDate).toLocaleDateString()}</p>
          </div>
        )}
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 font-medium">Description</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Unit price</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lineItems.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-4 text-center text-muted">
                No line items yet.
              </td>
            </tr>
          ) : (
            lineItems.map((li, i) => (
              <tr key={i}>
                <td className="py-2 text-slate">{li.description || "--"}</td>
                <td className="py-2 text-right text-slate">{li.quantity}</td>
                <td className="py-2 text-right text-slate">{money(li.unit_price)}</td>
                <td className="py-2 text-right text-slate">{money(li.quantity * li.unit_price)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1.5 text-sm">
          <div className="flex justify-between text-slate">
            <span>Subtotal</span>
            <span>{money(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-slate">
              <span>Discount</span>
              <span>-{money(discountAmount)}</span>
            </div>
          )}
          {taxAmount > 0 && (
            <div className="flex justify-between text-slate">
              <span>Tax</span>
              <span>{money(taxAmount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold text-ink">
            <span>Total</span>
            <span>{money(totalAmount)}</span>
          </div>
        </div>
      </div>

      {notes && (
        <div className="mt-6 border-t border-border pt-4 text-xs text-muted">
          <p className="whitespace-pre-wrap">{notes}</p>
        </div>
      )}
    </div>
  );
}
