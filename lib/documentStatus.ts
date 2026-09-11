import type { BadgeTone } from "@/components/ui/Badge";

export const DOCUMENT_REQUEST_STATUS_TONE: Record<string, BadgeTone> = {
  open: "warning",
  completed: "success",
  cancelled: "neutral",
};

export const SIGNATURE_REQUEST_STATUS_TONE: Record<string, BadgeTone> = {
  pending: "warning",
  completed: "success",
  declined: "danger",
  cancelled: "neutral",
};
