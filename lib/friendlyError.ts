// Shared error-sanitization for staff-facing forms: shows full detail in
// preview/dev builds (so failures stay debuggable), but in real production
// only ever shows either (a) a business-rule message an RPC deliberately
// wrote for a human to read, or (b) a generic, safe fallback — never a raw
// Postgres error (constraint name, relation name, column name, or an
// internal safety-trigger message never meant for staff eyes). Originally
// lived only in ClientModal as `stepError`; pulled out here so
// NewServiceModal and ActivateServiceModal stop showing raw database
// errors too (confirmed live: a documents_storage_bucket_check violation
// and "Audit events are immutable" both reached the activation/delete
// screens verbatim before this existed).

export type SbError = { message: string; code?: string; details?: string | null; hint?: string | null };

// next build always bakes NODE_ENV=production into a Vercel deployment —
// preview and production builds are identical on that axis, so NODE_ENV
// can't tell them apart. Only treat this as "real production" when we can
// positively confirm it: either Vercel's own NEXT_PUBLIC_VERCEL_ENV says
// so, or the browser is actually on the production hostname. Anything
// else (preview, local dev, unset) defaults to showing full error detail,
// since hiding detail on an environment we can't positively identify as
// production would make preview failures undebuggable.
export const PRODUCTION_HOSTNAME = "verexa-hq-phi.vercel.app";
function computeIsPreviewOrDev(): boolean {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === "production") return false;
  if (typeof window !== "undefined" && window.location.hostname === PRODUCTION_HOSTNAME) return false;
  return true;
}
const IS_PREVIEW_OR_DEV = computeIsPreviewOrDev();

// Postgres assigns SQLSTATE P0001 to a plain `raise exception` with no
// custom code — every hand-authored, staff-facing validation message this
// app's RPCs raise uses that form (e.g. "You do not have permission to
// apply service templates.", "This service has retained records that must
// be preserved..."). A handful of defensive, last-resort trigger messages
// use that same plain form but were never written for a human to read day
// to day (confirmed live: both fire as bare `raise exception '<text>'`
// with no custom SQLSTATE, same as every other business message) — those
// are excluded here so they fall through to the generic fallback instead
// of leaking internal audit-log terminology to staff.
const RAW_TRIGGER_MESSAGES = new Set(["Audit events are immutable", "Audit records are append-only"]);

const DEFAULT_FALLBACK =
  "There was a problem completing this action. No records were saved. Please try again, and contact support if it keeps happening.";

export function friendlyDbError(err: SbError, step?: string, fallback: string = DEFAULT_FALLBACK): string {
  if (IS_PREVIEW_OR_DEV) {
    const parts = [step ? `[${step}] ${err.message}` : err.message];
    if (err.code) parts.push(`code=${err.code}`);
    if (err.details) parts.push(`details=${err.details}`);
    if (err.hint) parts.push(`hint=${err.hint}`);
    return parts.join(" — ");
  }
  const lower = err.message.toLowerCase();
  if (lower.includes("row-level security") || lower.includes("not allowed") || lower.includes("permission")) {
    return "You don't have permission to complete this action. Contact a workspace admin if this seems wrong.";
  }
  if (err.code === "P0001" && !RAW_TRIGGER_MESSAGES.has(err.message.trim())) {
    return err.message;
  }
  return fallback;
}
