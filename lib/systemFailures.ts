import { createServiceClient } from "@/lib/supabase/service";

// A failure a workspace's own staff can't do anything about -- a missing
// system template, a missing env var, a Resend/storage outage, an
// unexpected DB error. Logged here and drained into a periodic digest
// email to failedsystem@verexahq.com (see app/api/cron/digest-system-failures).
// Contrast with an account-level failure (bad client data, a
// misconfigured automation step), which should instead notify the
// workspace's own admins via notify_workspace_admins -- they're the ones
// who can fix that, not platform IT.
export async function reportSystemFailure(
  source: string,
  message: string,
  options?: { workspaceId?: string; context?: Record<string, unknown> }
) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("system_failure_log").insert({
    source,
    message,
    workspace_id: options?.workspaceId ?? null,
    context: (options?.context ?? null) as never,
  });
  if (error) {
    // Logging the failure itself failed -- nothing further to fall back
    // to except the runtime logs, which is what this whole mechanism
    // exists to reduce reliance on.
    console.error(`reportSystemFailure: could not log failure from ${source}`, error, message);
  }
}

/** True for a Resend API failure that's about the input (bad/invalid recipient address), not the provider or our key. */
export function isAccountLevelResendError(errorText: string): boolean {
  return /Resend responded with 400:|Resend responded with 422:/.test(errorText);
}
