// Consistent, user-facing error translation. Never surface raw Postgres/
// Supabase error text (constraint names, RLS policy internals, stack
// traces) directly to end users — log the technical detail server-side
// (console.error, picked up by the hosting platform's log pipeline) and
// return one of these friendly messages instead.

export function friendlyAuthError(message: string | undefined | null): string {
  const m = (message || "").toLowerCase();
  if (m.includes("invalid login credentials")) return "That email or password isn't right. Please try again.";
  if (m.includes("email not confirmed")) return "Please confirm your email address before signing in.";
  if (m.includes("user already registered") || m.includes("already registered"))
    return "An account with that email already exists. Try signing in instead.";
  if (m.includes("password should be at least")) return "Password must be at least 8 characters.";
  if (m.includes("rate limit")) return "Too many attempts. Please wait a moment and try again.";
  if (m.includes("expired")) return "That link has expired. Please request a new one.";
  if (m.includes("invalid") && m.includes("token")) return "That link is invalid or has already been used.";
  if (m.includes("network")) return "We couldn't reach the server. Check your connection and try again.";
  return "Something went wrong. Please try again, or contact support if this continues.";
}

export function friendlyDbError(message: string | undefined | null): string {
  const m = (message || "").toLowerCase();
  if (m.includes("duplicate key") || m.includes("already exists"))
    return "A record with that information already exists.";
  if (m.includes("row-level security") || m.includes("permission denied"))
    return "You don't have permission to do that.";
  if (m.includes("violates foreign key")) return "That record is linked to other data and can't be changed this way.";
  if (m.includes("violates check constraint")) return "One of the values entered isn't valid for this field.";
  if (m.includes("network")) return "We couldn't reach the server. Check your connection and try again.";
  return "We couldn't complete that action. Please try again.";
}

export function logServerError(context: string, error: unknown) {
  // Centralized so a future structured-logging backend only needs to
  // change this one function.
  console.error(`[verexa-tax-office] ${context}`, error);
}
