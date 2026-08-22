import { createClient } from "@/lib/supabase/server";

export type PortalIdentity = {
  portalUserId: string;
  clientId: string;
  workspaceId: string;
  isPrimary: boolean;
  clientLabel: string;
};

function clientLabel(c: { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null } | null) {
  if (!c) return "Client";
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Client";
}

// Mirrors getCurrentWorkspace() but resolves the *portal* identity (a
// client_portal_users row) instead of a staff workspace_users row -- a
// portal user is never also a workspace_user, per the deliberate boundary
// documented on the clients table.
export async function getPortalIdentity(): Promise<PortalIdentity | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("client_portal_users")
    .select("id, client_id, workspace_id, is_primary, clients(client_type, first_name, last_name, business_name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return {
    portalUserId: data.id,
    clientId: data.client_id,
    workspaceId: data.workspace_id,
    isPrimary: data.is_primary,
    clientLabel: clientLabel(data.clients as never),
  };
}
