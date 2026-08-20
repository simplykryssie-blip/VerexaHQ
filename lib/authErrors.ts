// Supabase's generic "Invalid login credentials" doesn't say what's wrong.
// Other errors (email not confirmed, rate limits, etc.) are already
// specific and useful, so those pass through unchanged.
export function friendlyAuthError(message: string): string {
  if (message.toLowerCase().includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }
  return message;
}
