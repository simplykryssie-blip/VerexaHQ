import { z } from "zod";
import type { Enums } from "@/types/database";

type InvoiceStatus = Enums<"invoice_status">;
type PaymentMethod = Enums<"payment_method">;
type PaymentRecordStatus = Enums<"payment_record_status">;

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  partially_paid: "Partially paid",
  paid: "Paid",
  past_due: "Past due",
  void: "Void",
  refunded: "Refunded",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: "Card",
  ach: "ACH",
  cash: "Cash",
  check: "Check",
  money_order: "Money order",
  refund_transfer: "Refund transfer",
  other: "Other",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentRecordStatus, string> = {
  pending: "Pending",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
};

export const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as [PaymentMethod, ...PaymentMethod[]];

export function invoiceStatusLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (INVOICE_STATUS_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
export function paymentMethodLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (PAYMENT_METHOD_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
export function paymentStatusLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (PAYMENT_STATUS_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, "Enter a description."),
  quantity: z.coerce.number().min(0.01).default(1),
  unitPrice: z.coerce.number().min(0).default(0),
  discountAmount: z.coerce.number().min(0).default(0),
  taxAmount: z.coerce.number().min(0).default(0),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;

export const newInvoiceSchema = z.object({
  clientId: z.string().uuid("Choose a client."),
  engagementId: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  clientMessage: z.string().max(2000).optional().nullable(),
  internalNotes: z.string().max(2000).optional().nullable(),
  paymentTerms: z.string().max(200).optional().nullable(),
  items: z.array(invoiceItemSchema).min(1, "Add at least one line item."),
});
export type NewInvoiceInput = z.infer<typeof newInvoiceSchema>;

export const recordPaymentSchema = z.object({
  amount: z.coerce.number().min(0.01, "Enter an amount."),
  method: z.enum(PAYMENT_METHODS),
  referenceNumber: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
