import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const ACTIVE_WORKSPACE_COOKIE = "active_workspace_id";

export type CurrentWorkspace = {
  id: string;
  name: string;
  slug: string;
  workspace_type: string;
  is_owner: boolean;
  is_platform_home: boolean;
  status: string;
  suspension_reason: string | null;
};

function toCurrentWorkspace(row: {
  is_owner: boolean;
  workspaces: { id: string; name: string; slug: string; workspace_type: string; is_platform_home: boolean; status: string; suspension_reason: string | null } | null;
}): CurrentWorkspace | null {
  if (!row.workspaces) return null;
  const ws = row.workspaces;
  return {
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    workspace_type: ws.workspace_type,
    is_owner: row.is_owner,
    is_platform_home: ws.is_platform_home,
    status: ws.status,
    suspension_reason: ws.suspension_reason,
  };
}

export async function getCurrentWorkspace(): Promise<CurrentWorkspace | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Platform admins/IT can switch into a demo workspace (or back to their
  // own) via /api/workspace/switch, which sets this cookie after verifying
  // real active membership -- so it's re-verified here too rather than
  // trusted outright, in case membership was revoked since the cookie was
  // set. Anyone else simply never has this cookie.
  const activeWorkspaceId = cookies().get(ACTIVE_WORKSPACE_COOKIE)?.value;
  if (activeWorkspaceId) {
    const { data } = await supabase
      .from("workspace_users")
      .select("is_owner, workspaces(id, name, slug, workspace_type, is_platform_home, status, suspension_reason)")
      .eq("user_id", user.id)
      .eq("workspace_id", activeWorkspaceId)
      .eq("status", "active")
      .maybeSingle();
    const current = data ? toCurrentWorkspace(data as unknown as { is_owner: boolean; workspaces: Parameters<typeof toCurrentWorkspace>[0]["workspaces"] }) : null;
    if (current) return current;
  }

  const { data } = await supabase
    .from("workspace_users")
    .select("is_owner, workspaces(id, name, slug, workspace_type, is_platform_home, status, suspension_reason)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data ? toCurrentWorkspace(data as unknown as { is_owner: boolean; workspaces: Parameters<typeof toCurrentWorkspace>[0]["workspaces"] }) : null;
}

// The suspension-recovery surface a non-operational workspace must always be
// able to reach -- Verexa's own subscription/payment-method page (not
// /billing, which is this workspace's OWN client billing, an operational
// feature that suspension/archive correctly blocks) -- plus the
// released-staff "Set Up My Billing" flow, which briefly loads pages in the
// suspended personal workspace's own context before redirecting to Stripe
// Checkout. Used identically for suspended/archived/permanently_archived --
// none of them invent a narrower or wider recovery surface than what
// already exists for suspension.
const SUSPENSION_ALLOWED_PATH_PREFIXES = ["/settings/plan-usage", "/settings/profile", "/support"];

export function isSuspensionRecoveryPath(pathname: string): boolean {
  return SUSPENSION_ALLOWED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

// Mirrors the DB-level canonical rule (public.is_workspace_operational):
// only "active" is operational. Suspended, archived, and permanently
// archived are all non-operational -- there is no separate, weaker
// treatment for archived/permanently_archived here, on purpose.
export function isWorkspaceStatusOperational(status: string): boolean {
  return status === "active";
}

// Shared server-side gate for API routes/server actions that mutate
// operational workspace data (clients, engagements, documents, invitations,
// etc.) -- Phase 3 suspension enforcement, extended to cover the full
// archive lifecycle. Page loads are blocked centrally in
// app/(app)/layout.tsx; this covers the routes that bypass that layout.
// Returns an error string to return as a 403 when the workspace is not
// operational, or null when the request may proceed. Never call this from a
// billing-recovery route (Stripe checkout, payment method, workspace
// switch, seat-setup-for-released-staff) -- those must keep working at
// every non-operational stage.
export function workspaceOperationalError(workspace: Pick<CurrentWorkspace, "status">): string | null {
  if (workspace.status === "suspended") {
    return "This workspace is suspended pending billing. Resolve billing under Settings > Plan & Usage to restore access.";
  }
  if (workspace.status === "archived") {
    return "This workspace has been archived and no longer has normal access. Visit Settings > Plan & Usage or contact Support for recovery/export options.";
  }
  if (workspace.status === "permanently_archived") {
    return "This workspace has been permanently archived. Contact Support for data export options.";
  }
  if (!isWorkspaceStatusOperational(workspace.status)) {
    return "This workspace is not currently active.";
  }
  return null;
}
