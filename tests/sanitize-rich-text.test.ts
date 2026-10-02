// VEREXA-XSS-001: focused tests for the sanitizer that now sits in front of
// the three confirmed stored-XSS sinks (notes.body / tasks.description).
// Runs under this repo's default Node vitest environment -- no jsdom
// environment config is needed for this file: isomorphic-dompurify already
// falls back to its own internal jsdom instance whenever `window` is
// undefined, which is exactly the Node environment vitest runs tests in by
// default, so no vitest.config.ts change was required.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeRichText } from "@/lib/sanitizeRichText";

describe("sanitizeRichText (VEREXA-XSS-001)", () => {
  it("1: plain text survives untouched", () => {
    expect(sanitizeRichText("Called the client back, left a voicemail.")).toBe("Called the client back, left a voicemail.");
  });

  it("2/3: bold/italic/underline/strike survive", () => {
    expect(sanitizeRichText("<p><strong>bold</strong> <em>italic</em> <u>underline</u> <s>strike</s></p>")).toBe(
      "<p><strong>bold</strong> <em>italic</em> <u>underline</u> <s>strike</s></p>"
    );
  });

  it("4: headings h1-h6 survive", () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      const html = `<h${level}>Heading ${level}</h${level}>`;
      expect(sanitizeRichText(html)).toBe(html);
    }
  });

  it("5: ordered and unordered lists survive", () => {
    expect(sanitizeRichText("<ul><li>one</li><li>two</li></ul>")).toBe("<ul><li>one</li><li>two</li></ul>");
    expect(sanitizeRichText("<ol><li>one</li><li>two</li></ol>")).toBe("<ol><li>one</li><li>two</li></ol>");
  });

  it("6: blockquotes survive", () => {
    expect(sanitizeRichText("<blockquote>quoted</blockquote>")).toBe("<blockquote>quoted</blockquote>");
  });

  it("7: inline code and code blocks survive", () => {
    expect(sanitizeRichText("<p>run <code>npm test</code></p>")).toBe("<p>run <code>npm test</code></p>");
    expect(sanitizeRichText("<pre><code>const x = 1;</code></pre>")).toBe("<pre><code>const x = 1;</code></pre>");
  });

  it("8: horizontal rules survive", () => {
    expect(sanitizeRichText("<p>a</p><hr><p>b</p>")).toBe("<p>a</p><hr><p>b</p>");
  });

  it("9: hard breaks survive", () => {
    expect(sanitizeRichText("<p>line one<br>line two</p>")).toBe("<p>line one<br>line two</p>");
  });

  it("10: legitimate links survive (https, http, mailto)", () => {
    expect(sanitizeRichText('<a href="https://example.com">link</a>')).toBe('<a href="https://example.com">link</a>');
    expect(sanitizeRichText('<a href="http://example.com">link</a>')).toBe('<a href="http://example.com">link</a>');
    expect(sanitizeRichText('<a href="mailto:staff@example.com">email</a>')).toBe('<a href="mailto:staff@example.com">email</a>');
  });

  it("11: javascript: links are rejected", () => {
    const out = sanitizeRichText('<a href="javascript:alert(1)">click me</a>');
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("href");
  });

  it("12: other dangerous URL schemes are rejected", () => {
    for (const href of ["data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)"]) {
      const out = sanitizeRichText(`<a href="${href}">bad</a>`);
      expect(out).not.toContain("href");
    }
  });

  it("13: script elements are removed", () => {
    const out = sanitizeRichText('<p>hello</p><script>alert(document.cookie)</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
    expect(out).toContain("hello");
  });

  it("14: iframe elements are removed", () => {
    const out = sanitizeRichText('<iframe src="https://evil.example"></iframe><p>safe</p>');
    expect(out).not.toContain("<iframe");
    expect(out).toContain("safe");
  });

  it("15: SVG-based payloads are removed", () => {
    const out = sanitizeRichText('<svg onload="alert(1)"><circle /></svg><p>safe</p>');
    expect(out).not.toContain("<svg");
    expect(out).not.toContain("onload");
    expect(out).toContain("safe");
  });

  it("16: event-handler attributes are removed from any tag", () => {
    expect(sanitizeRichText('<p onclick="alert(1)">click</p>')).toBe("<p>click</p>");
    expect(sanitizeRichText('<img src="x" onerror="alert(1)">')).not.toContain("onerror");
    expect(sanitizeRichText('<a href="https://example.com" onmouseover="alert(1)">link</a>')).not.toContain("onmouseover");
  });

  it("17: dangerous CSS is removed -- only the literal text-align style survives", () => {
    expect(sanitizeRichText('<p style="color: red">x</p>')).toBe("<p>x</p>");
    expect(sanitizeRichText('<p style="background: url(javascript:alert(1))">x</p>')).toBe("<p>x</p>");
    expect(sanitizeRichText('<p style="text-align: center; background: url(evil)">x</p>')).toBe("<p>x</p>");
  });

  it("18: text-align survives for every value TextAlign can produce", () => {
    for (const value of ["left", "right", "center", "justify"]) {
      const html = `<p style="text-align: ${value}">x</p>`;
      expect(sanitizeRichText(html)).toBe(html);
    }
  });

  it("19: a mixed legitimate-formatting + XSS payload keeps the formatting and removes the attack", () => {
    const out = sanitizeRichText(
      '<p style="text-align: center"><strong>Important:</strong> bring your W-2.</p><script>alert(document.cookie)</script><img src=x onerror=alert(1)>'
    );
    expect(out).toContain('<p style="text-align: center">');
    expect(out).toContain("<strong>Important:</strong>");
    expect(out).toContain("bring your W-2.");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("alert");
  });

  it("20: sanitization is deterministic", () => {
    const payload = '<p style="text-align: center"><strong>Hi</strong></p><script>alert(1)</script>';
    const first = sanitizeRichText(payload);
    const second = sanitizeRichText(payload);
    const third = sanitizeRichText(payload);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("handles null/undefined/empty input safely", () => {
    expect(sanitizeRichText(null)).toBe("");
    expect(sanitizeRichText(undefined)).toBe("");
    expect(sanitizeRichText("")).toBe("");
  });
});

// Source-level regression checks (same convention as
// tests/contacts-phase4b-notes-editor.test.ts): proves each of the three
// confirmed sinks actually calls the sanitizer, and that the portal sink
// -- deliberately out of scope for this fix -- is untouched.
describe("VEREXA-XSS-001 sink wiring (source-level)", () => {
  const clientIdDir = join(process.cwd(), "app/(app)/clients/[id]");
  const engagementIdDir = join(process.cwd(), "app/(app)/engagements/[id]");
  const tabsSource = readFileSync(join(clientIdDir, "ClientWorkspaceTabs.tsx"), "utf8");
  const taskRowSource = readFileSync(join(engagementIdDir, "TaskRow.tsx"), "utf8");
  const portalTaskItemSource = readFileSync(join(process.cwd(), "components/portal/PortalTaskItem.tsx"), "utf8");

  function extractFunction(source: string, name: string): string {
    const start = source.indexOf(`export function ${name}(`);
    const rest = source.slice(start + 1);
    const nextExportOffset = rest.search(/\nexport function /);
    return nextExportOffset === -1 ? source.slice(start) : source.slice(start, start + 1 + nextExportOffset);
  }

  it("NotesTab sanitizes n.body before rendering", () => {
    const body = extractFunction(tabsSource, "NotesTab");
    expect(body).toMatch(/dangerouslySetInnerHTML=\{\{ __html: sanitizeRichText\(n\.body\) \}\}/);
  });

  it("TasksTab sanitizes t.description before rendering", () => {
    const body = extractFunction(tabsSource, "TasksTab");
    expect(body).toMatch(/dangerouslySetInnerHTML=\{\{ __html: sanitizeRichText\(t\.description\) \}\}/);
  });

  it("ClientWorkspaceTabs.tsx imports sanitizeRichText from the shared helper", () => {
    expect(tabsSource).toMatch(/import \{ sanitizeRichText \} from "@\/lib\/sanitizeRichText";/);
  });

  it("TaskRow sanitizes task.description before rendering", () => {
    expect(taskRowSource).toMatch(/dangerouslySetInnerHTML=\{\{ __html: sanitizeRichText\(task\.description\) \}\}/);
    expect(taskRowSource).toMatch(/import \{ sanitizeRichText \} from "@\/lib\/sanitizeRichText";/);
  });

  it("PortalTaskItem is unchanged -- still renders description as escaped JSX text, not HTML", () => {
    expect(portalTaskItemSource).not.toMatch(/dangerouslySetInnerHTML/);
    expect(portalTaskItemSource).not.toMatch(/sanitizeRichText/);
    expect(portalTaskItemSource).toMatch(/\{task\.description &&[\s\S]*<p[^>]*>\{task\.description\}<\/p>\}/);
  });
});
