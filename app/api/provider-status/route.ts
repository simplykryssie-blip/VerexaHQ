import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isEmailConfigured, isSmsConfigured, isStripeConfigured } from "@/lib/providerStatus";

const CONFIG_CHECK: Record<string, () => boolean> = {
  email: isEmailConfigured,
  sms: isSmsConfigured,
  stripe: isStripeConfigured,
};

// Combines env-var presence (are credentials set at all) with real send/
// webhook health from provider_status (does it actually work) -- record_provider_check
// only flips is_configured to true after a first real attempt, so env-var
// presence is still needed to tell "configured but never used yet" apart
// from "not configured".
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: rows } = await supabase
    .from("provider_status")
    .select("provider, status, consecutive_failures, last_check_at, last_success_at, last_failure_at, last_error");

  const byProvider = new Map((rows ?? []).map((r) => [r.provider, r]));

  const result: Record<string, unknown> = {};
  for (const provider of Object.keys(CONFIG_CHECK)) {
    const health = byProvider.get(provider);
    result[provider] = {
      configured: CONFIG_CHECK[provider](),
      status: health?.status ?? "unknown",
      consecutiveFailures: health?.consecutive_failures ?? 0,
      lastCheckAt: health?.last_check_at ?? null,
      lastSuccessAt: health?.last_success_at ?? null,
      lastFailureAt: health?.last_failure_at ?? null,
      lastError: health?.last_error ?? null,
    };
  }

  return NextResponse.json(result);
}
