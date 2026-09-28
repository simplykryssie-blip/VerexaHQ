// DNS record copy UX: the two pieces of pure logic behind the per-field and
// per-record copy buttons on the email-sending-domain and website
// custom-domain DNS setup screens (components/settings/EmailDomainCard.tsx,
// components/websites/WebsiteSettings.tsx). No jsdom/@testing-library is
// configured in this repo (every existing suite tests logic/API/DB, never
// renders a component) -- these tests exercise copyTextToClipboard and
// formatDnsRecordForCopy directly, mocking just the global APIs they touch,
// which is where the actual copy-exactness and failure-handling behavior
// lives. CopyIconButton/CopyRecordButton themselves are a thin ~15-line
// wrapper (setState + setTimeout) around this logic.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { copyTextToClipboard } from "@/lib/clipboard";
import { formatDnsRecordForCopy } from "@/lib/dns/formatDnsRecordForCopy";

describe("copyTextToClipboard", () => {
  const originalNavigator = globalThis.navigator;
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalDocument = (globalThis as { document?: unknown }).document;

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true });
    (globalThis as { window?: unknown }).window = originalWindow;
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  function mockModernClipboard(writeText: (v: string) => Promise<void>) {
    Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText } }, configurable: true });
    (globalThis as { window?: unknown }).window = { isSecureContext: true };
  }

  it("writes the exact value via navigator.clipboard.writeText when available, unaltered", async () => {
    const written: string[] = [];
    mockModernClipboard(async (v) => {
      written.push(v);
    });

    const value = "v=spf1 include:_spf.google.com ~all";
    const ok = await copyTextToClipboard(value);

    expect(ok).toBe(true);
    expect(written).toEqual([value]);
  });

  it("preserves special characters exactly -- quotes, @, underscore, periods, semicolons", async () => {
    const written: string[] = [];
    mockModernClipboard(async (v) => {
      written.push(v);
    });

    const value = 'v=DKIM1; k=rsa; p="MIGfMA0GCSq..."; t=@sub_domain.example.com.';
    const ok = await copyTextToClipboard(value);

    expect(ok).toBe(true);
    expect(written[0]).toBe(value);
    // Byte-for-byte, not just loosely equal -- no trimming of the trailing period.
    expect(written[0].endsWith(".")).toBe(true);
    expect(written[0].startsWith("v=DKIM1")).toBe(true);
  });

  it("preserves a long value in full, with no truncation", async () => {
    const written: string[] = [];
    mockModernClipboard(async (v) => {
      written.push(v);
    });

    const longValue = "google-site-verification=" + "a".repeat(2000) + "-end";
    const ok = await copyTextToClipboard(longValue);

    expect(ok).toBe(true);
    expect(written[0]).toHaveLength(longValue.length);
    expect(written[0]).toBe(longValue);
    expect(written[0].endsWith("-end")).toBe(true);
  });

  it("falls back to the execCommand path when navigator.clipboard throws, and still copies the exact value", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("permission denied")) } },
      configurable: true,
    });
    (globalThis as { window?: unknown }).window = { isSecureContext: true };

    let capturedValue: string | null = null;
    const fakeTextarea = {
      value: "",
      style: {} as Record<string, string>,
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(() => {
        capturedValue = fakeTextarea.value;
      }),
    };
    (globalThis as { document?: unknown }).document = {
      createElement: vi.fn(() => fakeTextarea),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      execCommand: vi.fn(() => true),
    };

    const value = "mail.example.com";
    const ok = await copyTextToClipboard(value);

    expect(ok).toBe(true);
    expect(fakeTextarea.value).toBe(value);
    expect(capturedValue).toBe(value);
  });

  it("returns false (never throws) when both clipboard and the fallback are unavailable", async () => {
    Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
    (globalThis as { window?: unknown }).window = { isSecureContext: false };
    (globalThis as { document?: unknown }).document = undefined;

    const ok = await copyTextToClipboard("anything");
    expect(ok).toBe(false);
  });

  it("returns false when the fallback textarea's execCommand reports failure", async () => {
    Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
    (globalThis as { window?: unknown }).window = { isSecureContext: false };
    const fakeTextarea = { value: "", style: {} as Record<string, string>, setAttribute: vi.fn(), focus: vi.fn(), select: vi.fn() };
    (globalThis as { document?: unknown }).document = {
      createElement: vi.fn(() => fakeTextarea),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      execCommand: vi.fn(() => false),
    };

    const ok = await copyTextToClipboard("anything");
    expect(ok).toBe(false);
  });
});

describe("formatDnsRecordForCopy (the 'Copy record' action)", () => {
  it("includes Priority when present, in a stable, readable order", () => {
    const text = formatDnsRecordForCopy({ type: "MX", name: "@", value: "mail.example.com", priority: 10 });
    expect(text).toBe("Type: MX\nName: @\nValue: mail.example.com\nPriority: 10");
  });

  it("omits the Priority line entirely when not applicable (undefined)", () => {
    const text = formatDnsRecordForCopy({ type: "TXT", name: "@", value: "v=spf1 ~all" });
    expect(text).not.toContain("Priority");
    expect(text).toBe("Type: TXT\nName: @\nValue: v=spf1 ~all");
  });

  it("omits the Priority line for null and empty-string priority too", () => {
    expect(formatDnsRecordForCopy({ type: "CNAME", name: "mail", value: "x.verexa.com", priority: null })).not.toContain("Priority");
    expect(formatDnsRecordForCopy({ type: "CNAME", name: "mail", value: "x.verexa.com", priority: "" })).not.toContain("Priority");
  });

  it("includes a priority of 0 (falsy but meaningful)", () => {
    const text = formatDnsRecordForCopy({ type: "MX", name: "@", value: "mail.example.com", priority: 0 });
    expect(text).toContain("Priority: 0");
  });

  it("preserves special characters and long values in the record text unaltered", () => {
    const longValue = "p=" + "b".repeat(500);
    const text = formatDnsRecordForCopy({ type: "TXT", name: "_dmarc", value: `v=DKIM1; k=rsa; ${longValue}` });
    expect(text).toContain(`v=DKIM1; k=rsa; ${longValue}`);
    expect(text.split("\n")[2]).toBe(`Value: v=DKIM1; k=rsa; ${longValue}`);
  });
});
