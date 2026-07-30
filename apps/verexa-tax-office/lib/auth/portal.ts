import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

// Internal-notes columns that must never be selected on behalf of a portal
// user (clients.notes is staff-only; there is no client-facing RLS path for
// it, but we also never want to accidentally fetch/leak it into a portal page).
export const PORTAL_SAFE_CLIENT_COLUMNS =
  "id, workspace_id, first_name, last_name, preferred_name, display_name, email, phone, company, client_type, status, portal_status, preferred_contact_method, preferred_language, timezone";

export type PortalClient = Pick<
  Tables<"clients">,
  | "id"
  | "workspace_id"
  | "first_name"
  | "last_name"
  | "preferred_name"
  | "display_name"
  | "email"
  | "phone"
  | "company"
  | "client_type"
  | "status"
  | "portal_status"
  | "preferred_contact_method"
  | "preferred_language"
  | "timezone"
>;

export type PortalContext = {
  userId: string;
  client: PortalClient;
  /** Set when the signed-in user is a secondary contact (e.g. spouse) rather
   * than the primary client record itself. */
  contactId: string | null;
  contactName: string | null;
};

/** Resolves the signed-in auth user to the client record they're allowed to
 * act as in the portal — either the primary client (clients.portal_user_id)
 * or an active, portal-enabled secondary contact (client_contacts). Both
 * paths mirror the live RLS linkage (can_access_client_record /
 * can_access_intake_submission / etc.) exactly, so a null result here means
 * RLS would reject every portal read for this user too. */
export async function getPortalContext(): Promise<PortalContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: ownClient } = await supabase
    .from("clients")
    .select(PORTAL_SAFE_CLIENT_COLUMNS)
    .eq("portal_user_id", user.id)
    .is("archived_at", null)
    .maybeSingle();

  if (ownClient) {
    return { userId: user.id, client: ownClient as PortalClient, contactId: null, contactName: null };
  }

  const { data: contact } = await supabase
    .from("client_contacts")
    .select(`id, first_name, last_name, client:clients(${PORTAL_SAFE_CLIENT_COLUMNS})`)
    .eq("auth_user_id", user.id)
    .eq("can_access_portal", true)
    .eq("is_active", true)
    .maybeSingle();

  const contactClient = contact?.client as PortalClient | null;
  if (contact && contactClient) {
    return {
      userId: user.id,
      client: contactClient,
      contactId: contact.id,
      contactName: `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || null,
    };
  }

  return null;
}
