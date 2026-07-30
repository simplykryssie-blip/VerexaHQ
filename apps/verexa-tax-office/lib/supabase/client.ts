"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

// Browser client. Uses the authenticated user's session (via cookies), so
// every read/write goes through Postgres RLS as that user — never a
// service-role bypass. This is the only Supabase client that should ever
// be imported from a "use client" component.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
