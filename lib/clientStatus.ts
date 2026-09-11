import type { BadgeTone } from "@/components/ui/Badge";

// Shared with the Clients list page and the client detail-page header, so a
// given lifecycle status always renders with the same tone everywhere.
export function clientStatusTone(status: string): BadgeTone {
  if (status === "lost") return "danger";
  if (status === "active") return "success";
  if (status === "archived") return "neutral";
  return "warning";
}
