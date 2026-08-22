import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Webhooks arrive unauthenticated (no user session) and are verified by
// provider signature instead, so routes that receive them use the
// service-role key rather than the cookie-based server client every other
// route uses.
export function createServiceClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
