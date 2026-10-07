import type { SupabaseClient } from "@supabase/supabase-js";

// Browser-side companion to lib/auth/requireAal2.ts's server-side hasAal2().
// Used by components/mfa/Aal2GateProvider.tsx to decide, once a gated
// fetch() comes back 403 aal2_required, which of the two existing recovery
// pages to send the user to: /settings/security (no factor enrolled yet --
// this IS the enrollment flow, see MfaSetup.tsx) or /mfa-challenge (a
// verified factor exists but this session hasn't challenged it yet). Sending
// a zero-factor account to /mfa-challenge is a dead end -- that page can
// only run supabase.auth.mfa.challenge() against an existing factor and
// shows "No authenticator found on this account" otherwise.
export async function hasVerifiedMfaFactorClient(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.auth.mfa.listFactors();
  return Boolean(data?.totp?.some((f) => f.status === "verified"));
}

// Only ever a same-origin relative path (both /settings/security and
// /mfa-challenge already accept and redirect to `next` after success -- see
// MfaSetup.tsx's confirmEnroll and app/mfa-challenge/page.tsx's handleSubmit)
// -- never passed to window.location or used as a full redirect target, so
// there's no open-redirect surface here, but the leading-slash check keeps
// this helper honest regardless of caller.
export function aal2RecoveryPath(hasFactor: boolean, nextPath: string): string {
  const base = hasFactor ? "/mfa-challenge" : "/settings/security";
  const safeNext = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard";
  return `${base}?next=${encodeURIComponent(safeNext)}`;
}

// True only for the specific, machine-readable AAL2-required shape every
// hasAal2() call site now returns (AAL2_REQUIRED_RESPONSE_BODY) -- never
// matches on the human error string, which is just copy and could change.
export function isAal2RequiredError(json: unknown): boolean {
  return Boolean(json && typeof json === "object" && (json as { code?: unknown }).code === "aal2_required");
}
