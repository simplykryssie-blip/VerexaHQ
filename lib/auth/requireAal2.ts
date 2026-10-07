import type { SupabaseClient } from "@supabase/supabase-js";

// VEREXA-AAL-001: the one place that decides whether the CURRENT session has
// actually completed its AAL2 (MFA) challenge. Deliberately reads the `aal`
// claim already embedded in the session's own access token -- a required
// Supabase JWT claim (see @supabase/auth-js's lib/types.d.ts RequiredClaims)
// -- rather than calling supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
// whose `nextLevel` is a different, unrelated signal: it reports "aal2" the
// moment ANY verified factor exists on the account, even if this session
// never completed a challenge for it. Using nextLevel here would let a
// password-only (stolen-credential) session pass as if it were AAL2 purely
// because the legitimate owner happens to have MFA enrolled -- exactly the
// bypass this finding is about. `currentLevel` has no such problem: it's
// fixed at token-issue/refresh time to whatever this specific session
// actually proved.
//
// The JWT payload decode mirrors the existing pattern already used twice in
// this codebase (lib/supabase/middleware.ts's getSessionIssuedAt,
// lib/supabaseEnvIsolation.ts's decodeJwtPayload) -- payload-only, no
// signature re-verification, because this reads the same session Supabase's
// own SDK has already authenticated for this request; it is never handed an
// arbitrary caller-supplied token.
function decodeAalClaim(accessToken: string): string | null {
  try {
    const payload = accessToken.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(base64));
    return typeof json.aal === "string" ? json.aal : null;
  } catch {
    return null;
  }
}

/**
 * True only if the request's own authenticated session has completed an
 * AAL2 (MFA) challenge. Takes the same server-side Supabase client the
 * calling route already constructed (via lib/supabase/server.ts's
 * createClient()) so this reuses its existing cookie-bound session instead
 * of starting a second one. Returns false (fail closed) for no session, a
 * malformed token, or a missing/invalid `aal` claim.
 */
export async function hasAal2(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) return false;
  return decodeAalClaim(accessToken) === "aal2";
}

// Machine-readable companion to the human error string every hasAal2() call
// site returns on a 403 -- added so the client can distinguish "blocked on
// AAL2" from any other 403 (a permission denial, a validation error) without
// matching on the exact wording, which is fragile and not meant to be an
// API contract. Every hasAal2() call site should return this exact object
// (see AAL2_REQUIRED_STATUS for the status code), so a single client-side
// handler (useAal2Gate(), components/mfa/Aal2GateProvider.tsx) can catch
// all of them instead of each caller re-implementing its own dead-end error
// message. See Session 2026-10-07's MFA enrollment/UX remediation.
export const AAL2_REQUIRED_CODE = "aal2_required" as const;
export const AAL2_REQUIRED_STATUS = 403;
export const AAL2_REQUIRED_RESPONSE_BODY = {
  error: "This action requires two-factor verification. Complete your authenticator challenge and try again.",
  code: AAL2_REQUIRED_CODE,
} as const;
