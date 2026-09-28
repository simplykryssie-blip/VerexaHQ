// Contacts production-sync (PR #329): normalizeName had no regression
// coverage. Locks in the two behaviors the requirement depends on --
// conservative on manually-typed mixed-case names (never touched, so
// "McDonald"/"O'Neal" survive blur untouched) and normalizing on
// all-lower/all-upper input (typed or imported), including at hyphen and
// apostrophe boundaries.
import { describe, it, expect } from "vitest";
import { normalizeName } from "@/lib/name";

describe("normalizeName", () => {
  it("leaves an already mixed-case manually-typed name untouched", () => {
    expect(normalizeName("McDonald")).toBe("McDonald");
    expect(normalizeName("O'Neal")).toBe("O'Neal");
    expect(normalizeName("DeShawn")).toBe("DeShawn");
  });

  it("capitalizes an all-lowercase name at word, hyphen, and apostrophe boundaries", () => {
    expect(normalizeName("john")).toBe("John");
    expect(normalizeName("mary jane")).toBe("Mary Jane");
    expect(normalizeName("o'neal")).toBe("O'Neal");
    expect(normalizeName("smith-jones")).toBe("Smith-Jones");
  });

  it("capitalizes an all-uppercase (imported) name the same way", () => {
    expect(normalizeName("JOHN")).toBe("John");
    expect(normalizeName("MARY JANE")).toBe("Mary Jane");
    expect(normalizeName("O'NEAL")).toBe("O'Neal");
  });

  it("does not blindly title-case every name -- a single-case name with no internal caps to lose is the only case rewritten", () => {
    // "McDonald" typed correctly must never be reduced to "Mcdonald" --
    // covered above -- this only asserts the complementary direction: a
    // single-case name has no internal capitalization to preserve, so it's
    // fair game for the boundary-capitalize pass.
    expect(normalizeName("mcdonald")).toBe("Mcdonald");
  });

  it("collapses internal whitespace and trims, without altering casing decisions", () => {
    expect(normalizeName("  john   smith  ")).toBe("John Smith");
  });

  it("returns an empty string unchanged", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName("   ")).toBe("");
  });
});
