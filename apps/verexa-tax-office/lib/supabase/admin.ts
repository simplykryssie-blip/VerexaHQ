import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Service-role client. NEVER import this into any client component or
// route that isn't explicitly server-only and access-checked first — it
// bypasses RLS entirely. Reserved for operations RLS structurally cannot
// express, such as inviting a not-yet-registered user (workspace_members.
// user_id is NOT NULL, so there is no "pending invite" row type — the
// auth.users row must exist first, which requires the Admin API).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase service role is not configured.");
  }
  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
