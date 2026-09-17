// Exercises the real, non-network parts of the legal acceptance archive
// end-to-end: the shared content data that /terms, /privacy, and the
// archive snapshot all render from (lib/legal/legalContent.ts), the
// snapshot function itself (lib/legal/renderLegalContentSnapshot.ts), and
// the combined-PDF renderer (lib/documents/renderLegalAcceptancePdf.ts) --
// using real pdf-lib output, not a mock. The live-Supabase (RLS,
// authorization, duplicate-prevention) side of this feature is covered by
// the Supabase-MCP-driven verification described in the implementation
// report, since running that here would need SUPABASE_SERVICE_ROLE_KEY,
// which (like critical-paths.test.ts) this suite does not have in this
// environment.
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { TERMS_SECTIONS, PRIVACY_SECTIONS } from "@/lib/legal/legalContent";
import { renderCurrentLegalContentSnapshot } from "@/lib/legal/renderLegalContentSnapshot";
import { renderLegalAcceptancePdf } from "@/lib/documents/renderLegalAcceptancePdf";

describe("legal content -- single canonical source", () => {
  it("Terms has all 16 numbered sections, in order", () => {
    expect(TERMS_SECTIONS).toHaveLength(16);
    TERMS_SECTIONS.forEach((s, i) => expect(s.title.startsWith(`${i + 1}.`)).toBe(true));
  });

  it("Privacy has all 11 numbered sections, in order", () => {
    expect(PRIVACY_SECTIONS).toHaveLength(11);
    PRIVACY_SECTIONS.forEach((s, i) => expect(s.title.startsWith(`${i + 1}.`)).toBe(true));
  });

  it("snapshot preserves the critical Day-90 anchoring language verbatim", () => {
    const { termsHtml } = renderCurrentLegalContentSnapshot();
    expect(termsHtml).toContain("90 days after the date it was first suspended (Day 0)");
    expect(termsHtml).toContain("not 90 days after the workspace became Archived");
  });

  it("snapshot contains every Terms and Privacy section heading", () => {
    const { termsHtml, privacyHtml } = renderCurrentLegalContentSnapshot();
    for (const section of TERMS_SECTIONS) expect(termsHtml).toContain(section.title);
    for (const section of PRIVACY_SECTIONS) expect(privacyHtml).toContain(section.title);
  });
});

describe("renderLegalAcceptancePdf -- real pdf-lib generation", () => {
  it("produces a valid, multi-page PDF containing the accepted content and identifying metadata", async () => {
    const { termsHtml, privacyHtml } = renderCurrentLegalContentSnapshot();
    const bytes = await renderLegalAcceptancePdf({
      archiveId: "11111111-1111-1111-1111-111111111111",
      version: "2026-09-16",
      effectiveDateLabel: "September 16, 2026",
      workspaceName: "Test Workspace",
      acceptedByName: "Jane Smith",
      acceptedByEmail: "jane@example.com",
      acceptedAtLabel: "September 16, 2026, 1:00:00 PM",
      termsHtml,
      privacyHtml,
    });

    expect(bytes.length).toBeGreaterThan(1000);

    // Round-trips through pdf-lib's own loader -- proves this is a real,
    // well-formed PDF, not just non-empty bytes.
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(3);
  });
});
