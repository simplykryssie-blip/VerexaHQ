// Regression coverage for VEREXAHQ -- CONTACTS COMPLETION PASS, Phase 3
// (cross-page selection + bulk/export scope). Before this, "select all"
// only ever spanned the current page's 50 rows, so bulk actions and CSV
// export silently operated on a partial subset whenever a filter matched
// more than one page. Source-level inspection matches this repo's existing
// convention for UI logic with no jsdom environment configured (see
// tests/contacts-csv-export-assigned-staff.test.ts).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const clientsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "app/(app)/clients");
const bulkTableSource = readFileSync(join(clientsDir, "ContactsBulkTable.tsx"), "utf8");
const pageSource = readFileSync(join(clientsDir, "page.tsx"), "utf8");

describe("page.tsx -- activeFilters/totalCount wiring", () => {
  it("passes the exact same searchFilters object to both search_clients and ContactsBulkTable, so they can't drift apart", () => {
    expect(pageSource).toMatch(/supabase\.rpc\("search_clients",\s*\{\s*p_workspace_id: workspace\.id,\s*\.\.\.searchFilters,/);
    expect(pageSource).toMatch(/activeFilters=\{searchFilters\}/);
  });

  it("passes the real total match count, not just the current page's length", () => {
    expect(pageSource).toMatch(/totalCount=\{count \?\? clients\.length\}/);
  });
});

describe("ContactsBulkTable -- select-all-matching source-level invariants", () => {
  it("refuses to select past MAX_BULK_SELECT_ALL rather than silently truncating to a partial subset", () => {
    const body = bulkTableSource.match(/async function selectAllMatching\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(body).toMatch(/totalCount > MAX_BULK_SELECT_ALL/);
    expect(body).toMatch(/toast\.show\(/);
    // The refusal must return before ever calling search_clients -- no
    // partial fetch/select on the way to the error.
    const refusalIndex = body.indexOf("totalCount > MAX_BULK_SELECT_ALL");
    const rpcIndex = body.indexOf('rpc("search_clients"');
    expect(refusalIndex).toBeGreaterThanOrEqual(0);
    expect(rpcIndex).toBeGreaterThan(refusalIndex);
  });

  it("reissues search_clients with the exact same activeFilters, unpaginated", () => {
    const body = bulkTableSource.match(/async function selectAllMatching\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(body).toMatch(/rpc\("search_clients",\s*\{\s*p_workspace_id: workspaceId,\s*\.\.\.activeFilters,/);
  });

  it("enriches fetched rows with assignedStaff the same way page.tsx does, rather than leaving CSV export's Assigned Staff column blank for all-filtered rows", () => {
    const body = bulkTableSource.match(/async function selectAllMatching\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(body).toMatch(/relationship_manager_id/);
    expect(body).toMatch(/resolveAssignedStaff\(/);
  });

  it("selectedRows is computed from allFilteredRows when active, so bulk actions/CSV export see every matching contact, not just the visible page", () => {
    expect(bulkTableSource).toMatch(/\(allFilteredRows \?\? rows\)\.filter\(\(r\) => selected\.has\(r\.id\)\)/);
  });

  it("clearSelection and toggleAll both reset allFilteredRows -- no selection can silently persist beyond what's visibly indicated", () => {
    const clearBody = bulkTableSource.match(/function clearSelection\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(clearBody).toMatch(/setAllFilteredRows\(null\)/);
    const toggleAllBody = bulkTableSource.match(/function toggleAll\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(toggleAllBody).toMatch(/setAllFilteredRows\(null\)/);
  });

  it("the 'select all matching' control only appears once the current page is fully selected and more rows exist beyond it", () => {
    expect(bulkTableSource).toMatch(/!allFilteredRows && allSelected && canSelectAllMatching/);
    expect(bulkTableSource).toMatch(/const canSelectAllMatching = totalCount > rows\.length/);
  });

  it("the selection banner text clearly distinguishes 'all matching' from a plain page-scoped count", () => {
    expect(bulkTableSource).toMatch(/All \$\{allFilteredRows\.length\} matching contacts selected/);
  });
});
