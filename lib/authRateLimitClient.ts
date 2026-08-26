// Client-side helper for the /api/auth/rate-limit check shared by the
// login and forgot-password forms. Fails open (returns true = allowed) on
// any network/parse error so an infra hiccup on the rate limiter can never
// wedge the sign-in button in a permanent "please wait" state.
export async function checkRateLimitClientSide(action: "login" | "password-reset" | "signup", email: string): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/rate-limit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, email }),
    });
    if (!response.ok) return true;
    const { allowed } = await response.json();
    return allowed !== false;
  } catch {
    return true;
  }
}
