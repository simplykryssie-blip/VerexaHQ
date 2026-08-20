import { createServiceClient } from "@/lib/supabase/service";

// Sliding-window limiter backed by a SECURITY DEFINER Postgres function
// (public.check_rate_limit) so limits hold across serverless instances.
// Fails open on an infra error -- a broken limiter should never be why a
// legitimate request gets rejected.
export async function checkRateLimit(key: string, maxHits: number, windowSeconds: number): Promise<boolean> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_key: key,
      p_max_hits: maxHits,
      p_window_seconds: windowSeconds,
    });
    if (error) return true;
    return data === true;
  } catch {
    // createServiceClient() throws synchronously if SUPABASE_SERVICE_ROLE_KEY
    // is missing/misconfigured -- that's an infra error too, and should fail
    // open the same as an RPC error rather than crashing the route handler.
    return true;
  }
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
