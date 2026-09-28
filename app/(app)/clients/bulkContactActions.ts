// Pure logic for the Contacts list's bulk-action toolbar, kept separate from
// ContactsBulkTable.tsx so it's directly unit-testable without mocking
// Supabase or next/navigation.
//
// Bulk status intentionally excludes "lost" and "archived": both go through
// their own dedicated RPCs (mark_client_lost, archive_client/restore_client)
// because both cascade to engagements/document requests (and, for lost,
// invoices too) -- a bare status update would silently skip all of that.
// Selected contacts already in either of those two statuses are skipped by
// bulk status, never silently mutated by it.
export const BULK_STATUS_OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

export type BulkStatusValue = (typeof BULK_STATUS_OPTIONS)[number]["value"];

const BULK_ELIGIBLE_STATUSES: readonly string[] = BULK_STATUS_OPTIONS.map((o) => o.value);

export function isEligibleForBulkStatus(currentStatus: string): boolean {
  return BULK_ELIGIBLE_STATUSES.includes(currentStatus);
}

/** Splits selected rows into those a bulk status change may touch and those
 * it must leave alone, so the caller can apply the mutation only to
 * `eligible` and report `skipped` rather than mutating everything blindly. */
export function partitionForBulkStatus<T extends { lifecycle_status: string }>(
  rows: T[]
): { eligible: T[]; skipped: T[] } {
  const eligible = rows.filter((r) => isEligibleForBulkStatus(r.lifecycle_status));
  const skipped = rows.filter((r) => !isEligibleForBulkStatus(r.lifecycle_status));
  return { eligible, skipped };
}

/** Same set-difference operation TagsEditor's single-client removeTag
 * already performs, generalized for one selected row at a time. */
export function tagsAfterBulkRemove(tags: string[] | null, tag: string): string[] {
  return (tags ?? []).filter((t) => t !== tag);
}

/** Only rows that actually carry the tag need a write -- filters the
 * selection down before mutating, so a bulk "remove tag" applied to a mixed
 * selection doesn't fire a no-op update against every row. */
export function rowsHavingTag<T extends { tags: string[] | null }>(rows: T[], tag: string): T[] {
  return rows.filter((r) => (r.tags ?? []).includes(tag));
}

/** Bulk archive shares its eligible set with bulk status (lead/active/
 * inactive) -- "lost" and already-"archived" contacts are skipped, not
 * re-archived or silently converted. A named wrapper around
 * partitionForBulkStatus for call-site clarity, since archive is a distinct
 * action (goes through archive_client, not a bare status write) even though
 * the eligibility set happens to match. */
export function partitionForBulkArchive<T extends { lifecycle_status: string }>(
  rows: T[]
): { eligible: T[]; skipped: T[] } {
  return partitionForBulkStatus(rows);
}

export function isEligibleForBulkRestore(currentStatus: string): boolean {
  return currentStatus === "archived";
}

/** Bulk restore's eligible set is the mirror image of archive's -- only
 * already-archived contacts can be restored; everything else is skipped. */
export function partitionForBulkRestore<T extends { lifecycle_status: string }>(
  rows: T[]
): { eligible: T[]; skipped: T[] } {
  const eligible = rows.filter((r) => isEligibleForBulkRestore(r.lifecycle_status));
  const skipped = rows.filter((r) => !isEligibleForBulkRestore(r.lifecycle_status));
  return { eligible, skipped };
}

// Contacts Reconciliation Audit -- Phase 3 (cross-page selection). "Select
// all matching" fetches full row data for every contact matching the
// current filters (not just their ids) so bulk actions/export can operate
// on them exactly like a normal selection -- but doing that for an
// unbounded result set from the browser is both slow and a real risk with
// large workspaces, so it's capped. Past the cap, the UI must refuse and
// ask the user to narrow their filters rather than silently selecting only
// a partial, arbitrary subset of what they asked for.
export const MAX_BULK_SELECT_ALL = 500;

// Contacts Reconciliation Audit -- bulk hard delete. delete_clients (server
// side, one call per whole selection) reports a per-row outcome rather than
// a single success/failure so the UI can show exactly which contacts were
// skipped and why -- "has become an established client" (an engagement,
// invoice, payment, or quote already exists) is the one expected/common
// skip reason and gets its own summary line; anything else surfaces as its
// own line since it means something the caller didn't anticipate.
export type DeleteClientsResultRow = { client_id: string; deleted: boolean; reason: string | null };

export type DeleteClientsSummary = {
  deletedCount: number;
  establishedClientSkips: { id: string; reason: string }[];
  otherSkips: { id: string; reason: string }[];
};

const ESTABLISHED_CLIENT_MARKER = "Has become an established client";

export function summarizeDeleteClientsResult(rows: DeleteClientsResultRow[]): DeleteClientsSummary {
  const deletedCount = rows.filter((r) => r.deleted).length;
  const skipped = rows.filter((r) => !r.deleted);
  const establishedClientSkips = skipped
    .filter((r) => (r.reason ?? "").startsWith(ESTABLISHED_CLIENT_MARKER))
    .map((r) => ({ id: r.client_id, reason: r.reason ?? "" }));
  const otherSkips = skipped
    .filter((r) => !(r.reason ?? "").startsWith(ESTABLISHED_CLIENT_MARKER))
    .map((r) => ({ id: r.client_id, reason: r.reason ?? "Unknown error" }));
  return { deletedCount, establishedClientSkips, otherSkips };
}

/** The subset of search_clients' own filter parameters "select all
 * matching" needs to reissue the same query without pagination -- kept as
 * one type so page.tsx and ContactsBulkTable.tsx can't drift out of sync
 * with each other or with the RPC's actual parameter names. */
export type SearchClientsFilters = {
  p_query?: string;
  p_lifecycle_statuses?: string[];
  p_tag?: string;
  p_service_id?: string;
  p_assigned_staff_id?: string;
  p_pipeline_stage_name?: string;
  p_missing_documents?: boolean;
  p_outstanding_balance?: boolean;
  p_client_type?: string;
  p_has_email?: boolean;
  p_has_phone?: boolean;
};
