import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { assertSupabaseProjectMatchesEnvironment, getBrowserAppEnvironment } from "@/lib/env";

export function createClient() {
  // VEREXA-ENV-001: fail closed rather than silently talking to the wrong
  // Supabase project from the browser.
  assertSupabaseProjectMatchesEnvironment(process.env.NEXT_PUBLIC_SUPABASE_URL, getBrowserAppEnvironment());

  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
