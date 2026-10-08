// Regression coverage for VEREXAHQ -- CONTACTS COMPLETION PASS, Phase 2
// (canonical client archive/restore mechanism, Product Decision #14).
// archive_client/restore_client are new SECURITY DEFINER RPCs modeled on
// mark_client_lost's own cascade style but lighter (no invoice voiding,
// fully reversible). This file covers the pure eligibility-partitioning
// logic directly, and the button/bulk-table wiring via source inspection --
// matching this repo's existing convention for UI that drives Supabase
// calls with no jsdom environment configured (see
// tests/contacts-csv-export-assigned-staff.test.ts).
import { describe, it, expect } from "vitest";
import {
  partitionForBulkArchive,
  partitionForBulkRestore,
  isEligibleForBulkRestore,
} from "@/app/(app)/clients/bulkContactActions";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const clientsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "app/(app)/clients");

describe("partitionForBulkArchive", () => {
  it("treats a contact with no disposition as eligible, archived/lost as skipped", () => {
    const rows = [
      { id: "c1", archived_at: null, lost_at: null },
      { id: "c2", archived_at: null, lost_at: null },
      { id: "c3", archived_at: "2026-01-01", lost_at: null },
      { id: "c4", archived_at: null, lost_at: "2026-01-02" },
    ];
    const { eligible, skipped } = partitionForBulkArchive(rows);
    expect(eligible.map((r) => r.id)).toEqual(["c1", "c2"]);
    expect(skipped.map((r) => r.id)).toEqual(["c3", "c4"]);
  });

  it("returns two empty arrays for an empty selection", () => {
    const { eligible, skipped } = partitionForBulkArchive([]);
    expect(eligible).toEqual([]);
    expect(skipped).toEqual([]);
  });
});

describe("isEligibleForBulkRestore / partitionForBulkRestore", () => {
  it("only an archived-and-not-lost contact is eligible for restore", () => {
    expect(isEligibleForBulkRestore({ archived_at: "2026-01-01", lost_at: null })).toBe(true);
    expect(isEligibleForBulkRestore({ archived_at: null, lost_at: null })).toBe(false);
    expect(isEligibleForBulkRestore({ archived_at: "2026-01-01", lost_at: "2026-01-02" })).toBe(false);
  });

  it("partitions a mixed selection so only archived contacts are restored", () => {
    const rows = [
      { id: "c1", archived_at: "2026-01-01", lost_at: null },
      { id: "c2", archived_at: null, lost_at: null },
      { id: "c3", archived_at: "2026-01-01", lost_at: null },
    ];
    const { eligible, skipped } = partitionForBulkRestore(rows);
    expect(eligible.map((r) => r.id)).toEqual(["c1", "c3"]);
    expect(skipped.map((r) => r.id)).toEqual(["c2"]);
  });

  it("every input row appears in exactly one output array", () => {
    const rows = [
      { id: "c1", archived_at: "2026-01-01", lost_at: null },
      { id: "c2", archived_at: null, lost_at: "2026-01-02" },
    ];
    const { eligible, skipped } = partitionForBulkRestore(rows);
    expect(eligible.length + skipped.length).toBe(rows.length);
  });
});

describe("ArchiveClientButton -- source-level invariants", () => {
  const source = readFileSync(join(clientsDir, "[id]/ArchiveClientButton.tsx"), "utf8");

  it("calls archive_client and restore_client by name (the new Phase 2 RPCs, not a bare status update)", () => {
    expect(source).toMatch(/rpc\("archive_client"/);
    expect(source).toMatch(/rpc\("restore_client"/);
  });

  it("never offers archive/restore for a 'lost' client -- that's mark_client_lost's own terminal state", () => {
    expect(source).toMatch(/if \(lostAt\) return null;/);
  });

  it("renders Restore (not Archive) once a client is already archived", () => {
    const archivedBranch = source.match(/if \(archivedAt\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(archivedBranch).toMatch(/restore_client/);
    expect(archivedBranch).not.toMatch(/archive_client/);
  });
});

describe("ContactsBulkTable -- bulk archive/restore source-level invariants", () => {
  const source = readFileSync(join(clientsDir, "ContactsBulkTable.tsx"), "utf8");

  it("bulk archive uses partitionForBulkArchive and calls archive_client per eligible row", () => {
    const body = source.match(/async function applyArchive\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(body).toMatch(/partitionForBulkArchive\(selectedRows\)/);
    expect(body).toMatch(/rpc\("archive_client"/);
  });

  it("bulk restore uses partitionForBulkRestore and calls restore_client per eligible row", () => {
    const body = source.match(/async function applyRestore\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(body).toMatch(/partitionForBulkRestore\(selectedRows\)/);
    expect(body).toMatch(/rpc\("restore_client"/);
  });

  it("the Restore bulk action is only shown when at least one selected row is already archived", () => {
    expect(source).toMatch(/hasArchivedSelected = selectedRows\.some\(\(r\) => Boolean\(r\.archived_at\) && !r\.lost_at\)/);
    expect(source).toMatch(/canEdit && hasArchivedSelected/);
  });

  it("bulk archive/restore are gated on canEdit -- the same permission bulk status already requires", () => {
    const archiveButtonBlock = source.match(/\{canEdit && \(\s*<button[\s\S]*?applyArchive/)?.[0] ?? "";
    expect(archiveButtonBlock).toContain("canEdit &&");
  });
});
