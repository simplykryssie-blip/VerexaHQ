import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { assertSupabaseProjectMatchesEnvironment, getAppEnvironment } from "@/lib/env";

export function createClient() {
  const cookieStore = cookies();

  // VEREXA-ENV-001: fail closed rather than silently talking to the wrong
  // Supabase project from a Server Component/Action.
  assertSupabaseProjectMatchesEnvironment(process.env.NEXT_PUBLIC_SUPABASE_URL, getAppEnvironment());

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component -- middleware refreshes the
            // session instead, so this can be safely ignored.
          }
        },
      },
    }
  );
}
