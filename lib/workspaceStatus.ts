import type { BadgeTone } from "@/components/ui/Badge";

// Platform-admin-only: a workspace's own lifecycle status (not to be
// confused with a client's lifecycle_status). Shared across every
// Platform Admin page that lists or details workspaces.
export const WORKSPACE_STATUS_TONE: Record<string, BadgeTone> = {
  active: "success",
  suspended: "danger",
  archived: "neutral",
};
