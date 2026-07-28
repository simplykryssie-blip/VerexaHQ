// Shared friendly-error translator for the app's forms (Product Polish
// standard: "Never display technical validation messages"). Postgres
// assigns SQLSTATE P0001 to a plain `raise exception` with no custom code
// -- that's how this app's RPCs and triggers surface a message meant for a
// human to read, so those are shown verbatim. Anything else (constraint
// names, relation names, connection errors) falls back to plain language
// instead of leaking database internals to a user.
export type FriendlySbError = { message: string; code?: string } | null | undefined;

export function friendlyError(err: FriendlySbError, fallback: string): string {
  if (!err) return fallback;
  if (err.code === "P0001") return err.message;
  return fallback;
}
