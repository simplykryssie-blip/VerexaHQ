import type { Enums } from "@/types/database";

type ReminderStatus = Enums<"reminder_status">;
type OutboxStatus = Enums<"outbox_status">;
type OutboxChannel = Enums<"outbox_channel">;

export const REMINDER_STATUS_LABELS: Record<ReminderStatus, string> = {
  scheduled: "Scheduled",
  processing: "Processing",
  sent: "Sent",
  skipped: "Skipped",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const OUTBOX_STATUS_LABELS: Record<OutboxStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  sent: "Sent",
  delivered: "Delivered",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const OUTBOX_CHANNEL_LABELS: Record<OutboxChannel, string> = {
  sms: "SMS",
  email: "Email",
  portal: "Portal",
  webhook: "Webhook",
};

export function reminderStatusLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (REMINDER_STATUS_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
export function outboxStatusLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (OUTBOX_STATUS_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
export function outboxChannelLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (OUTBOX_CHANNEL_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
