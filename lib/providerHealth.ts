import { createServiceClient } from "@/lib/supabase/service";

// record_provider_check writes to a platform-wide operational table with
// no per-caller authorization concept (it isn't workspace-scoped), so its
// EXECUTE grant is restricted to service_role -- this always goes through
// the service-role client rather than whatever client the caller has,
// mirroring how the Stripe webhook route already handles privileged writes.
export async function recordProviderCheck(provider: "email" | "sms" | "stripe", success: boolean, error?: string) {
  const supabase = createServiceClient();
  await supabase.rpc("record_provider_check", { p_provider: provider, p_success: success, p_error: error ?? undefined });
}
