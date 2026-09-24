// Contacts production-sync (PR #329) reconciliation: formatPhone was already
// applied to the client-detail phones list, but the Contacts list "Phone"
// column, the Contact detail "Identifying info" primary-phone field, and the
// Quick View header line all still rendered the raw stored digits. Fixed by
// reusing this same existing formatPhone utility at those 3 call sites
// (app/(app)/clients/clientListColumns.tsx, ClientWorkspaceTabs.tsx,
// ClientQuickViewDrawer.tsx) rather than introducing a second formatter --
// the stored value itself is never rewritten, only how it displays.
//
// formatPhone itself had no direct regression coverage despite being
// production code already relied on elsewhere; this closes that gap now
// that 3 more call sites depend on it.
import { describe, it, expect } from "vitest";
import { formatPhone } from "@/lib/phone";

describe("formatPhone", () => {
  it("formats a plain 10-digit string as (XXX) XXX-XXXX", () => {
    expect(formatPhone("5551234567")).toBe("(555) 123-4567");
  });

  it("strips existing punctuation before formatting, so re-formatting an already-formatted value is a no-op", () => {
    expect(formatPhone("(555) 123-4567")).toBe("(555) 123-4567");
    expect(formatPhone("555-123-4567")).toBe("(555) 123-4567");
  });

  it("formats a partial (in-progress) number without padding or guessing missing digits", () => {
    expect(formatPhone("555")).toBe("555");
    expect(formatPhone("555123")).toBe("(555) 123");
  });

  it("ignores digits beyond the 10th rather than producing an overlong string", () => {
    expect(formatPhone("15551234567")).toBe("(155) 512-3456");
  });

  it("returns an empty string unchanged", () => {
    expect(formatPhone("")).toBe("");
  });
});
