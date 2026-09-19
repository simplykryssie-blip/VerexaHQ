// Pure logic for the Contacts list's bulk-action toolbar, kept separate from
// ContactsBulkTable.tsx so it's directly unit-testable without mocking
// Supabase or next/navigation.
//
// Bulk status intentionally excludes "lost" and "archived": "lost" goes
// through the mark_client_lost RPC (cascades to engagements/invoices/
// document requests -- a bare update would silently skip all of that), and
// "archived" has no existing single-client mechanism anywhere in the app to
// preserve (confirmed by a full-repo search -- nothing ever writes
// lifecycle_status = 'archived' today), so this bulk action doesn't invent
// one. Selected contacts already in either of those two statuses are
// skipped, never silently mutated.
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
