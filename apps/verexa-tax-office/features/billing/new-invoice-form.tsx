"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SearchablePicker, type PickerOption } from "@/features/engagements/client-picker";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { formatCurrency } from "@/lib/formatters";
import type { InvoiceItemInput } from "@/lib/validation/billing";

const BLANK_ITEM: InvoiceItemInput = { description: "", quantity: 1, unitPrice: 0, discountAmount: 0, taxAmount: 0 };

function lineTotal(item: InvoiceItemInput) {
  return Math.max(0, item.quantity * item.unitPrice - item.discountAmount + item.taxAmount);
}

export function NewInvoiceForm({ workspaceId, clients, engagements }: { workspaceId: string; clients: PickerOption[]; engagements: (PickerOption & { clientId: string })[] }) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);
  const [engagementId, setEngagementId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Due on receipt");
  const [clientMessage, setClientMessage] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [items, setItems] = useState<InvoiceItemInput[]>([{ ...BLANK_ITEM }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const engagementOptions = engagements.filter((e) => !clientId || e.clientId === clientId);
  const total = items.reduce((sum, i) => sum + lineTotal(i), 0);

  function updateItem(index: number, patch: Partial<InvoiceItemInput>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) {
      setError("Choose a client.");
      return;
    }
    if (items.some((i) => !i.description.trim())) {
      setError("Every line item needs a description.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: invoiceNumber, error: numError } = await supabase.rpc("next_invoice_number", { p_workspace_id: workspaceId });
    if (numError || !invoiceNumber) {
      setError(friendlyDbError(numError?.message));
      setSubmitting(false);
      return;
    }

    const { data: invoice, error: invError } = await supabase
      .from("invoices")
      .insert({
        workspace_id: workspaceId,
        client_id: clientId,
        engagement_id: engagementId,
        invoice_number: invoiceNumber,
        due_date: dueDate || null,
        payment_terms: paymentTerms || null,
        client_message: clientMessage || null,
        internal_notes: internalNotes || null,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    if (invError || !invoice) {
      setError(friendlyDbError(invError?.message));
      setSubmitting(false);
      return;
    }

    const { error: itemsError } = await supabase.from("invoice_items").insert(
      items.map((it, idx) => ({
        workspace_id: workspaceId,
        invoice_id: invoice.id,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        discount_amount: it.discountAmount,
        tax_amount: it.taxAmount,
        line_total: lineTotal(it),
        sort_order: idx,
      })),
    );

    setSubmitting(false);
    if (itemsError) {
      setError(friendlyDbError(itemsError.message));
      return;
    }
    toast.success("Invoice created");
    router.push(`/invoices/${invoice.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-3xl">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoice details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Client *</Label>
              <SearchablePicker options={clients} value={clientId} onChange={(v) => { setClientId(v); setEngagementId(null); }} placeholder="Search clients…" />
            </div>
            <div className="space-y-1">
              <Label>Engagement (optional)</Label>
              <SearchablePicker options={engagementOptions} value={engagementId} onChange={setEngagementId} placeholder="Search engagements…" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Payment terms</Label>
              <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Message to client</Label>
            <Textarea value={clientMessage} onChange={(e) => setClientMessage(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>Internal notes</Label>
            <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Line items</CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={() => setItems((prev) => [...prev, { ...BLANK_ITEM }])}>
            <Plus className="h-4 w-4" /> Add item
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
                {items.length > 1 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              <Input value={item.description} onChange={(e) => updateItem(idx, { description: e.target.value })} placeholder="1040 tax preparation" />
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Qty</Label>
                  <Input type="number" step="0.01" value={item.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Unit price</Label>
                  <Input type="number" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Discount</Label>
                  <Input type="number" step="0.01" value={item.discountAmount} onChange={(e) => updateItem(idx, { discountAmount: Number(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tax</Label>
                  <Input type="number" step="0.01" value={item.taxAmount} onChange={(e) => updateItem(idx, { taxAmount: Number(e.target.value) || 0 })} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-right">Line total: {formatCurrency(lineTotal(item))}</p>
            </div>
          ))}
          <p className="text-right text-sm font-semibold">Total: {formatCurrency(total)}</p>
        </CardContent>
      </Card>

      <Button type="submit" variant="brand" disabled={submitting}>
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Create invoice
      </Button>
    </form>
  );
}
