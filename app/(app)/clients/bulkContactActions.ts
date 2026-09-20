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
