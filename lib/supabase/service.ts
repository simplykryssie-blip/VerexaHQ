import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Webhooks arrive unauthenticated (no user session) and are verified by
// provider signature instead, so routes that receive them use the
// service-role key rather than the cookie-based server client every other
// route uses.
//
// Next.js's App Router patches the global fetch() and caches GET requests
// by default -- `export const dynamic = "force-dynamic"` on a route does
// not reliably cascade that opt-out down into a third-party client's
// internal fetch calls. Any cron/service-role query whose URL doesn't
// happen to vary between invocations (no timestamp param, etc.) was
// getting cached on its first call and silently reused forever after,
// which is why e.g. send-pending-portal-invites kept logging "fetched 0
// job(s)" even once real pending rows existed. Force every request from
// this client to bypass that cache -- these reads are always meant to see
// live data.
export function createServiceClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
