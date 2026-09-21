// Contact Entity Type Consistency fix: lib/documentEntityLabels.ts's clientLabel
// used to only special-case client_type === "business" when falling back to
// business_name, so a trust/estate/organization client (which shares that
// same business_name column -- there's no per-type name field in the schema)
// displayed as "Unnamed client" everywhere this shared helper is used
// (engagements, review-queue, tax, reports x3, calendar, documents).
import { describe, it, expect } from "vitest";
import { clientLabel } from "@/lib/documentEntityLabels";

describe("documentEntityLabels.clientLabel -- entity name behavior across all 5 client types", () => {
  it("uses first + last name for an individual", () => {
    expect(
      clientLabel({ client_type: "individual", first_name: "Jane", last_name: "Doe", business_name: null })
    ).toBe("Jane Doe");
  });

  it("uses business_name for a business", () => {
    expect(
      clientLabel({ client_type: "business", first_name: null, last_name: null, business_name: "Acme LLC" })
    ).toBe("Acme LLC");
  });

  it("uses business_name for a trust", () => {
    expect(
      clientLabel({ client_type: "trust", first_name: null, last_name: null, business_name: "The Doe Family Trust" })
    ).toBe("The Doe Family Trust");
  });

  it("uses business_name for an estate", () => {
    expect(
      clientLabel({ client_type: "estate", first_name: null, last_name: null, business_name: "Estate of John Doe" })
    ).toBe("Estate of John Doe");
  });

  it("uses business_name for an organization", () => {
    expect(
      clientLabel({ client_type: "organization", first_name: null, last_name: null, business_name: "Doe Nonprofit" })
    ).toBe("Doe Nonprofit");
  });

  it("falls back to 'Unnamed client' for a non-individual with no business_name set", () => {
    expect(clientLabel({ client_type: "trust", first_name: null, last_name: null, business_name: null })).toBe(
      "Unnamed client"
    );
  });

  it("returns '--' for a null client", () => {
    expect(clientLabel(null)).toBe("--");
  });
});
