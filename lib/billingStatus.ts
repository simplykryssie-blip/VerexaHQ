import type { BadgeTone } from "@/components/ui/Badge";

// Quotes and invoices share the same status vocabulary (draft/sent/paid/void).
export const BILLING_DOCUMENT_STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  sent: "warning",
  paid: "success",
  void: "neutral",
  cancelled: "danger",
};

export const PAYMENT_STATUS_TONE: Record<string, BadgeTone> = {
  succeeded: "success",
  failed: "danger",
  refunded: "neutral",
};
