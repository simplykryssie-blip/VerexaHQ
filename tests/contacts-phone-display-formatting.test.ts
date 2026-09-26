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
//
// Follow-up fix: formatPhone used to take the first 10 digits of whatever
// was stored with no regard for a country code, so an 11-digit number
// stored with a leading US/Canada "1" (e.g. from an import or a number
// typed as "1-555-123-4567") rendered as (155) 512-3456 -- the "1" bled
// into the area code instead of being dropped. formatPhone now strips a
// leading 1 specifically on an 11-digit number before formatting.
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

  it("strips a leading US/Canada country-code 1 on an 11-digit number instead of misreading it as the first digit of the area code", () => {
    expect(formatPhone("15551234567")).toBe("(555) 123-4567");
    expect(formatPhone("+1 (555) 123-4567")).toBe("(555) 123-4567");
  });

  it("does not strip a leading 1 that isn't a country code -- an 11-digit number not starting with 1, or any non-11-digit length, is just truncated/left as-is", () => {
    expect(formatPhone("21234567891")).toBe("(212) 345-6789");
    expect(formatPhone("123456789")).toBe("(123) 456-789");
  });

  it("returns an empty string unchanged", () => {
    expect(formatPhone("")).toBe("");
  });
});
