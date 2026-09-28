// Regression coverage for VEREXAHQ -- CONTACTS COMPLETION PASS, Phase 5a
// (generic signature-request final signed PDF). The engagement-letter
// signing flow already files a real merged PDF (renders one from HTML); the
// generic uploaded-document signature-request flow only ever locked the
// original attachment with no flattened output. This appends a signature
// certificate page to the actual uploaded PDF via a new TextPdf.fromExisting
// factory, reusing every existing drawing method (heading/signatureImage/
// signatureTyped/save) rather than duplicating that logic.
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { TextPdf } from "@/lib/pdf/textPdf";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("TextPdf.fromExisting", () => {
  it("loads an existing PDF's bytes and appends a new page for the certificate, preserving the original page(s)", async () => {
    const original = await PDFDocument.create();
    original.addPage([612, 792]);
    const originalBytes = await original.save();

    const pdf = await TextPdf.fromExisting(originalBytes);
    pdf.heading("Signature Certificate");
    pdf.subtle("Test Document");
    const resultBytes = await pdf.save();

    const resultDoc = await PDFDocument.load(resultBytes);
    // Original page + the certificate page the constructor's own addPage() adds.
    expect(resultDoc.getPageCount()).toBe(2);
  });

  it("can draw a typed-only signature (no image) onto the appended certificate page without throwing", async () => {
    const original = await PDFDocument.create();
    original.addPage([612, 792]);
    const originalBytes = await original.save();

    const pdf = await TextPdf.fromExisting(originalBytes);
    pdf.heading("Signature Certificate");
    pdf.signatureTyped("Jamie Chen", "9/20/2026, 1:00:00 PM");
    const resultBytes = await pdf.save();

    expect(resultBytes.length).toBeGreaterThan(originalBytes.length);
  });

  it("can embed a real drawn signature image onto the appended certificate page", async () => {
    // A 1x1 transparent PNG, valid enough for pdf-lib's embedPng to accept.
    const tinyPngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const pngBytes = Uint8Array.from(Buffer.from(tinyPngBase64, "base64"));

    const original = await PDFDocument.create();
    original.addPage([612, 792]);
    const originalBytes = await original.save();

    const pdf = await TextPdf.fromExisting(originalBytes);
    pdf.heading("Signature Certificate");
    await pdf.signatureImage(pngBytes, "Jamie Chen", "9/20/2026, 1:00:00 PM");
    const resultBytes = await pdf.save();

    const resultDoc = await PDFDocument.load(resultBytes);
    expect(resultDoc.getPageCount()).toBe(2);
  });
});

describe("app/api/sign/finalize/route.ts -- source-level invariants", () => {
  const source = readFileSync(join(repoRoot, "app/api/sign/finalize/route.ts"), "utf8");

  it("checks the idempotency guard (final_pdf_attachment_id already set) before doing any PDF work", () => {
    // Searched from after the header comment (which mentions both terms in
    // prose) so this checks the actual code order, not incidental wording.
    const codeStart = source.indexOf("export async function POST");
    const idempotencyIndex = source.indexOf('alreadyFiled: true', codeStart);
    const pdfWorkIndex = source.indexOf("await TextPdf.fromExisting", codeStart);
    expect(idempotencyIndex).toBeGreaterThan(codeStart);
    expect(pdfWorkIndex).toBeGreaterThan(idempotencyIndex);
  });

  it("is a no-op (not an error) until the request is actually completed", () => {
    expect(source).toMatch(/notYetComplete/);
    expect(source).toMatch(/status !== "completed"/);
  });

  it("only flattens application/pdf uploads -- other mime types are a safe no-op, not an error", () => {
    expect(source).toMatch(/unsupportedMimeType/);
    expect(source).toMatch(/mime_type !== "application\/pdf"/);
  });

  it("files the flattened PDF as a new version of the original via the existing versioning mechanism, not an unrelated file", () => {
    expect(source).toMatch(/replaces_attachment_id: attachment\.id/);
    expect(source).toMatch(/is_latest_version: false/);
  });

  it("records the result on signature_requests.final_pdf_attachment_id", () => {
    expect(source).toMatch(/\.from\("signature_requests"\)\.update\(\{ final_pdf_attachment_id: newAttachment\.id \}\)/);
  });
});

describe("Signing call sites -- finalize wiring", () => {
  it("PublicSignView.tsx calls /api/sign/finalize with the token, fire-and-forget, after a successful sign", () => {
    const source = readFileSync(join(repoRoot, "components/sign/PublicSignView.tsx"), "utf8");
    const body = source.match(/async function sign\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(body).toMatch(/fetch\("\/api\/sign\/finalize"/);
    expect(body).toMatch(/JSON\.stringify\(\{ token \}\)/);
    expect(body).toMatch(/\.catch\(\(\) => \{\}\)/);
  });

  it("SignaturesPanel.tsx calls /api/sign/finalize with the parent signatureRequestId after a successful record_signature", () => {
    const source = readFileSync(join(repoRoot, "components/documents/SignaturesPanel.tsx"), "utf8");
    const body = source.match(/async function submitSignature\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
    expect(body).toMatch(/fetch\("\/api\/sign\/finalize"/);
    expect(body).toMatch(/signatureRequestId: parentRequest\.id/);
  });
});
