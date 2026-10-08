// Pure logic for the Contacts list's bulk-action toolbar, kept separate from
// ContactsBulkTable.tsx so it's directly unit-testable without mocking
// Supabase or next/navigation.
//
// Bulk archive/restore are operational actions. Lost contacts are handled by
// the dedicated mark_client_lost RPC because it cascades engagements,
// invoices, and document requests.
export type ContactDispositionRow = {
  archived_at?: string | null;
  lost_at?: string | null;
};

export function isEligibleForBulkArchive(row: ContactDispositionRow): boolean {
  return !row.archived_at && !row.lost_at;
}

export function partitionForBulkArchive<T extends ContactDispositionRow>(
  rows: T[]
): { eligible: T[]; skipped: T[] } {
  const eligible = rows.filter(isEligibleForBulkArchive);
  const skipped = rows.filter((r) => !isEligibleForBulkArchive(r));
  return { eligible, skipped };
}

export function isEligibleForBulkRestore(row: ContactDispositionRow): boolean {
  return Boolean(row.archived_at) && !row.lost_at;
}

export function partitionForBulkRestore<T extends ContactDispositionRow>(
  rows: T[]
): { eligible: T[]; skipped: T[] } {
  const eligible = rows.filter(isEligibleForBulkRestore);
  const skipped = rows.filter((r) => !isEligibleForBulkRestore(r));
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
    p_tag?: string;
  p_service_id?: string;
  p_assigned_staff_id?: string;
  p_pipeline_stage_name?: string;
  p_missing_documents?: boolean;
  p_outstanding_balance?: boolean;
  p_client_type?: string;
  p_has_email?: boolean;
  p_has_phone?: boolean;
  p_unassigned_only?: boolean;
};
