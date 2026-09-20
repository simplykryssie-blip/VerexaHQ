// Regression coverage for VEREXAHQ -- CONTACTS EASY FIX #4 (CSV export
// consistency): the Contacts CSV export (app/(app)/clients/ContactsBulkTable.tsx)
// still used its original fixed column list and never included Assigned
// Staff, even though that column was already added to the on-screen table
// in Fix #2. The audit confirmed ClientRow.assignedStaff was already
// available with no new backend access needed -- assignedStaffCsvValue is
// exported specifically so the exact exported text is unit-testable
// without a DOM/Blob/download flow.
import { describe, it, expect } from "vitest";
import { assignedStaffCsvValue } from "@/app/(app)/clients/ContactsBulkTable";

describe("assignedStaffCsvValue", () => {
  it("1/2: exports the assigned staff member's display name", () => {
    expect(assignedStaffCsvValue({ id: "staff-1", display_name: "Jamie Chen" })).toBe("Jamie Chen");
  });

  it("3: exports 'Unassigned' for a contact with no relationship manager", () => {
    expect(assignedStaffCsvValue(null)).toBe("Unassigned");
    expect(assignedStaffCsvValue(undefined)).toBe("Unassigned");
  });

  it("falls back to 'Staff' when assigned but the profile's display_name is missing (matches the table column's own fallback)", () => {
    expect(assignedStaffCsvValue({ id: "staff-missing", display_name: null })).toBe("Staff");
  });

  it("4: never returns an internal id -- only display_name text ever appears in the output", () => {
    const value = assignedStaffCsvValue({ id: "staff-1", display_name: "Jamie Chen" });
    expect(value).not.toContain("staff-1");
    expect(value).toBe("Jamie Chen");
  });
});

// downloadCsv itself is not exported (it drives a Blob/URL.createObjectURL/
// anchor-click download flow with no jsdom environment configured in this
// project's vitest.config.ts -- see tests/clients-page.test.ts's own
// precedent of testing row-render/value logic via exported pure functions
// rather than the DOM-driving wrapper). The header/column list and the
// "selected contacts only" export scope are covered by direct source
// inspection below, matching this repo's existing test conventions for
// non-exported UI wiring.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const contactsBulkTablePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "app/(app)/clients/ContactsBulkTable.tsx"
);
const source = readFileSync(contactsBulkTablePath, "utf8");

describe("Contacts CSV export -- source-level invariants", () => {
  it("6: the existing columns (Name/Type/Email/Phone/Status/Tags) all remain in the header, unchanged", () => {
    const headerLine = source.match(/const header = \[(.*)\];/)?.[1] ?? "";
    for (const existing of ["Name", "Type", "Email", "Phone", "Status", "Tags"]) {
      expect(headerLine).toContain(`"${existing}"`);
    }
  });

  it("adds exactly one new column, 'Assigned Staff', positioned to match the on-screen table (after Status, before Tags)", () => {
    const headerLine = source.match(/const header = \[(.*)\];/)?.[1] ?? "";
    expect(headerLine).toContain('"Assigned Staff"');
    const statusIndex = headerLine.indexOf('"Status"');
    const assignedIndex = headerLine.indexOf('"Assigned Staff"');
    const tagsIndex = headerLine.indexOf('"Tags"');
    expect(statusIndex).toBeGreaterThanOrEqual(0);
    expect(assignedIndex).toBeGreaterThan(statusIndex);
    expect(tagsIndex).toBeGreaterThan(assignedIndex);
  });

  it("4: never exports relationship_manager_id or any other internal id -- only assignedStaffCsvValue's resolved text", () => {
    // Scoped to the CSV export path specifically -- relationship_manager_id
    // legitimately appears elsewhere in this file (Fix #3's bulk assignment
    // feature writes it directly), which is correct, unrelated code.
    const downloadCsvBody = source.match(/function downloadCsv\(rows: ClientRow\[\]\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(downloadCsvBody).not.toMatch(/relationship_manager_id/);
    // The per-row csv line builder must call the safe helper, not read the
    // raw assignedStaff object (which carries an id field) directly.
    const csvLineBuilder = downloadCsvBody.match(/const lines = rows\.map\(\(c\) =>([\s\S]*?)\);/)?.[1] ?? "";
    expect(csvLineBuilder).toMatch(/assignedStaffCsvValue\(c\.assignedStaff\)/);
    expect(csvLineBuilder).not.toMatch(/c\.assignedStaff\.id/);
    expect(csvLineBuilder).not.toMatch(/workspace_id/i);
  });

  it("7: export scope remains selected contacts only -- downloadCsv is still called with selectedRows, not the full page or a new all-matching-filters scope", () => {
    expect(source).toMatch(/downloadCsv\(selectedRows\)/);
    expect(source).not.toMatch(/downloadCsv\(rows\)/);
  });

  it("5: workspace boundary is inherited from ClientRow -- the CSV export path itself adds no new query or cross-workspace lookup", () => {
    // Scoped to downloadCsv specifically -- Contacts Completion Pass Phase 3
    // legitimately added a user_profiles query elsewhere in this file (for
    // "select all matching" row enrichment, mirroring page.tsx's own
    // pattern), which is correct, unrelated code for a different feature.
    const downloadCsvBody = source.match(/function downloadCsv\(rows: ClientRow\[\]\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(downloadCsvBody).not.toMatch(/\.from\(["']user_profiles["']\)/);
    expect(downloadCsvBody).not.toMatch(/\.from\(["']workspace_users["']\)/);
  });
});
