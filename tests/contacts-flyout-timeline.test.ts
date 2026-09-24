// Regression coverage for VEREXAHQ CONTACTS PASS 3 (Quick-View flyout
// trimmed to an overview, general Timeline tab wired in). Source-text
// assertion for the flyout/tab-bar shape (both are "use client" components
// calling hooks outside a render tree, the same constraint every other
// Contacts pass's component tests have hit); primaryAddressLine is a pure
// function and is exercised directly.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { primaryAddressLine } from "@/app/(app)/clients/[id]/ClientQuickViewDrawer";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const drawerSource = readFileSync(join(repoRoot, "app/(app)/clients/[id]/ClientQuickViewDrawer.tsx"), "utf8");
const tabsBodySource = readFileSync(join(repoRoot, "app/(app)/clients/[id]/ClientTabsBody.tsx"), "utf8");

describe("ClientQuickViewDrawer -- no longer embeds the full Contact tab system", () => {
  it("does not render ClientTabsBody (Details/Tasks/Documents/Messages/Billing/Notes) inline -- still imports displayName from the same file, but no longer the tab-bar component itself", () => {
    expect(drawerSource).not.toMatch(/<ClientTabsBody/);
    expect(drawerSource).not.toContain("ClientTab,");
    expect(drawerSource).not.toContain("useState<ClientTab>");
  });

  it("keeps identity, status, quick stats, insights, recent activity, and the existing actions", () => {
    expect(drawerSource).toContain("Avatar");
    expect(drawerSource).toContain("clientStatusTone");
    expect(drawerSource).toContain("<ClientInsightWidgets");
    expect(drawerSource).toContain("Recent activity");
    expect(drawerSource).toContain("<ConvertLeadButton");
    expect(drawerSource).toContain("<MarkLeadLostButton");
    expect(drawerSource).toContain("<ArchiveClientButton");
    expect(drawerSource).toContain("<QuickActions");
  });

  it("keeps a single, unambiguous 'Open Full Record' action", () => {
    expect(drawerSource).toMatch(/Open [Ff]ull [Rr]ecord/);
    expect(drawerSource).toContain("function expand()");
  });

  it("applies formatPhone to the primary phone in the header, same as the rest of Contacts (Pass 1)", () => {
    expect(drawerSource).toContain('import { formatPhone } from "@/lib/phone"');
    expect(drawerSource).toContain("formatPhone(client.primary_phone)");
  });

  it("shows the primary address in the quick-overview header using already-fetched data (no new query)", () => {
    expect(drawerSource).toContain("primaryAddressLine(addresses)");
  });

  it("reuses the exact same ClientWorkspaceProps the full page already fetches -- no second data source", () => {
    expect(drawerSource).toContain('import type { ClientWorkspaceProps } from "./ClientWorkspace"');
    expect(drawerSource).not.toMatch(/createClient\(\)|supabase\.from\(/);
  });
});

describe("primaryAddressLine", () => {
  it("prefers the address marked is_primary", () => {
    const addresses = [
      { street: "1 First St", street2: null, city: "Lafayette", state: "LA", zip: "70501", is_primary: false },
      { street: "2 Second Ave", street2: "Suite 300", city: "Lafayette", state: "LA", zip: "70503", is_primary: true },
    ];
    expect(primaryAddressLine(addresses)).toBe("2 Second Ave, Suite 300, Lafayette, LA 70503");
  });

  it("falls back to the first address when none is marked primary", () => {
    const addresses = [{ street: "1 First St", street2: null, city: "Lafayette", state: "LA", zip: "70501", is_primary: false }];
    expect(primaryAddressLine(addresses)).toBe("1 First St, Lafayette, LA 70501");
  });

  it("returns null for no addresses on file, not a crash or an empty-string line", () => {
    expect(primaryAddressLine([])).toBeNull();
  });

  it("omits street2 cleanly when absent", () => {
    const addresses = [{ street: "1 First St", street2: null, city: "Lafayette", state: "LA", zip: "70501", is_primary: true }];
    expect(primaryAddressLine(addresses)).toBe("1 First St, Lafayette, LA 70501");
  });
});

describe("Timeline -- the existing TimelineTab is now a real tab, not dead code", () => {
  it("TABS includes Timeline", () => {
    expect(tabsBodySource).toMatch(/TABS = \[.*"Timeline".*\] as const/);
  });

  it("renders the existing TimelineTab component (reused, not rebuilt) with the full unfiltered timeline", () => {
    expect(tabsBodySource).toContain("import { OverviewTab, MessagesTab, BillingTab, NotesTab, TasksTab, TimelineTab }");
    expect(tabsBodySource).toContain('tab === "Timeline" && <TimelineTab timeline={timeline} />');
  });
});
