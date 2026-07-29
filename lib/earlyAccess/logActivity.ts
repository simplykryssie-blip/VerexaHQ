"use client";

import { authenticatedFetch } from "@/lib/authenticatedFetch";

// Fire-and-forget admin activity logging. Never throws -- an audit-log
// failure must not block the admin action it's describing from succeeding
// or from showing the user a result.
export async function logAdminActivity(entry: {
  campaignId?: string | null;
  workspaceId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}) {
  try {
    await authenticatedFetch("/api/early-access/log-activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
  } catch {
    // Non-fatal: the admin action itself already succeeded or failed on its
    // own terms before this was called.
  }
}
