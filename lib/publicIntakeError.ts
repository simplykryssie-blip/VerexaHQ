// Error sanitization for the public (unauthenticated) tax-intake pages and
// their API routes. Unlike lib/friendlyError.ts (staff-facing forms, which
// deliberately show full raw detail on preview builds for debuggability),
// this form is taxpayer-facing on every environment including preview --
// so there is no "show raw detail on preview" exception here. A raw
// Postgres/Supabase error (a missing-WHERE-clause safety rejection, a
// constraint violation, an undefined-function error, a SQLSTATE) must
// never reach this UI, confirmed live: a `safeupdate`-triggered "DELETE
// requires a WHERE clause" error reached the first screen verbatim before
// this existed.
export type SbError = { message?: string; code?: string };

const DEFAULT_FALLBACK = "We couldn't complete that. Please try again.";

// SQLSTATE P0001 is what Postgres assigns to a plain `raise exception` with
// no explicit code -- every hand-authored, taxpayer-facing message this
// app's public intake RPCs raise uses that form (e.g. "That code is
// incorrect.", "This link is invalid or has expired."). Anything else is
// never shown to a taxpayer.
export function publicIntakeErrorMessage(err: unknown, fallback: string = DEFAULT_FALLBACK): string {
  const e = err as SbError | null;
  if (e && typeof e === "object" && e.code === "P0001" && typeof e.message === "string" && e.message.trim()) {
    return e.message;
  }
  return fallback;
}
