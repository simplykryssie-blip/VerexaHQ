import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
// VEREXA-ENV-001: import directly from lib/supabaseEnvIsolation.ts, NOT
// "@/lib/env" -- that file's top-level @vercel/functions import can't be
// resolved in this browser bundle either (same reason it broke Edge
// middleware: its websocket helper requires the Node-only `ws` package).
// See Session 38.
import { assertSupabaseProjectMatchesEnvironment, getBrowserAppEnvironment } from "@/lib/supabaseEnvIsolation";

export function createClient() {
  // VEREXA-ENV-001: fail closed rather than silently talking to the wrong
  // Supabase project from the browser.
  assertSupabaseProjectMatchesEnvironment(process.env.NEXT_PUBLIC_SUPABASE_URL, getBrowserAppEnvironment());

  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
