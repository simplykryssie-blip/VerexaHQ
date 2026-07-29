// Friendly error text for the tax organizer pages (Client-First System
// Template Experience standard: "Never display technical validation
// messages"). Postgres assigns SQLSTATE P0001 to a plain `raise
// exception` with no custom code -- that's how this app's RPCs and
// triggers surface a message meant for a human to read. Anything else
// (constraint names, relation names, connection errors) falls back to
// plain language instead of leaking database internals to a client.
export type OrganizerSbError = { message: string; code?: string } | null | undefined;

export function friendlyOrganizerError(err: OrganizerSbError, fallback: string): string {
  if (!err) return fallback;
  if (err.code === "P0001") return err.message;
  return fallback;
}
