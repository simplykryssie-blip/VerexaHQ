// Stored-XSS fix: task descriptions and client note bodies are staff-authored
// rich-text HTML (RichTextEditor/Tiptap output) rendered via
// dangerouslySetInnerHTML. The prior "sanitization" in AddForms.tsx/
// AddTaskForm.tsx/FirmDetailClient.tsx was a regex tag-strip used only as an
// empty-content check -- its result was discarded, so the raw HTML (script
// tags, event-handler attributes, javascript: URLs included) was stored and
// later rendered completely unsanitized at:
//   - app/(app)/clients/[id]/ClientWorkspaceTabs.tsx (task description, note body)
//   - app/(app)/engagements/[id]/TaskRow.tsx (task description)
// (CodeQL js/incomplete-multi-character-sanitization, PR #349 SARIF findings 1-4.)
//
// sanitizeRichTextHtml() is the actual control point: applied at each render
// site, not at write time. This file covers the helper's own behavior --
// both legitimate-content preservation (verified against real Tiptap
// generateHTML() output, not assumption) and a broad security-payload
// battery -- plus, via static-shape checks (same pattern as
// tests/public-organizer-portal-authorization-fix.test.ts), that the three
// confirmed sinks actually call it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

// This project runs vitest under plain Node (no jsdom `environment:` is
// configured -- see tests/contacts-phase4b-notes-editor.test.ts's own note
// on this), but Tiptap's generateHTML() drives ProseMirror's DOMSerializer,
// which needs a real `window`/`document` to build DOM nodes even outside a
// browser. isomorphic-dompurify already depends on jsdom for its own
// server-side DOMPurify implementation, so that same jsdom is reused here
// rather than adding a second copy as a direct dependency. It isn't
// reachable via a normal import: isomorphic-dompurify's package.json
// `exports` map doesn't expose the `jsdom` subpath, so bare/subpath
// resolution is refused (ERR_PACKAGE_PATH_NOT_EXPORTED) -- requiring the
// resolved absolute file path bypasses that map, since `exports` only
// governs bare-specifier resolution.
const jsdomApiPath = join(
  dirname(require.resolve("isomorphic-dompurify")),
  "..",
  "node_modules",
  "jsdom",
  "lib",
  "api.js"
);
// No @types/jsdom in this project (it's a transitive dependency of
// isomorphic-dompurify, not a direct one) -- a minimal local shape for just
// the constructor surface used here avoids adding one solely for a type.
type JSDOMCtor = new (html: string) => { window: typeof globalThis };
const { JSDOM } = createRequire(import.meta.url)(jsdomApiPath) as { JSDOM: JSDOMCtor };
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window as unknown as typeof globalThis.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Node = dom.window.Node;

import { generateHTML } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { sanitizeRichTextHtml } from "../lib/sanitizeRichTextHtml";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Mirrors the exact extension set RichTextEditor.tsx loads when
// allowPageBreak=true (the superset -- tasks/notes use the allowPageBreak
//=false subset, but this file verifies the sanitizer against everything
// RichTextEditor as a whole can ever produce, per the remediation scope).
const TIPTAP_EXTENSIONS = [
  StarterKit,
  Underline,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  TaskList,
  TaskItem.configure({ nested: true }),
];

function tiptapHtml(content: Record<string, unknown>[]): string {
  return generateHTML({ type: "doc", content }, TIPTAP_EXTENSIONS);
}

describe("sanitizeRichTextHtml -- legitimate Tiptap-generated content is preserved", () => {
  it("preserves heading, bold, italic, underline, and text-align together", () => {
    const html = tiptapHtml([
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Heading" }] },
      {
        type: "paragraph",
        attrs: { textAlign: "center" },
        content: [
          { type: "text", marks: [{ type: "bold" }], text: "bold" },
          { type: "text", text: " " },
          { type: "text", marks: [{ type: "italic" }], text: "italic" },
          { type: "text", text: " " },
          { type: "text", marks: [{ type: "underline" }], text: "underline" },
        ],
      },
    ]);
    const out = sanitizeRichTextHtml(html);
    expect(out).toContain("<h2>Heading</h2>");
    expect(out).toMatch(/<p style="text-align:\s*center">/);
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
    expect(out).toContain("<u>underline</u>");
  });

  it("preserves bullet and ordered lists", () => {
    const html = tiptapHtml([
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "bullet" }] }] }] },
      { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "ordered" }] }] }] },
    ]);
    const out = sanitizeRichTextHtml(html);
    expect(out).toContain("<ul>");
    expect(out).toContain("<ol>");
    expect(out).toContain("bullet");
    expect(out).toContain("ordered");
  });

  it("preserves a safe link with Tiptap's default target/rel", () => {
    const html = tiptapHtml([
      { type: "paragraph", content: [{ type: "text", marks: [{ type: "link", attrs: { href: "https://example.com" } }], text: "a link" }] },
    ]);
    const out = sanitizeRichTextHtml(html);
    expect(out).toMatch(/<a target="_blank" rel="noopener noreferrer nofollow" href="https:\/\/example\.com">a link<\/a>/);
  });

  it("preserves task lists AND their checkbox (label + input[type=checkbox]), forced disabled", () => {
    const html = tiptapHtml([
      {
        type: "taskList",
        content: [
          { type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "done task" }] }] },
          { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "open task" }] }] },
        ],
      },
    ]);
    const out = sanitizeRichTextHtml(html);
    expect(out).toMatch(/<ul data-type="taskList">/);
    expect(out).toMatch(/<li data-checked="true" data-type="taskItem">/);
    expect(out).toMatch(/<label><input type="checkbox" checked="checked" disabled="disabled">/);
    expect(out).toMatch(/<li data-checked="false" data-type="taskItem">/);
    expect(out).toContain("done task");
    expect(out).toContain("open task");
  });

  it("preserves table structure, headers, cells, and colgroup/col column sizing", () => {
    const html = tiptapHtml([
      {
        type: "table",
        content: [
          { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "H1" }] }] }] },
          { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "cell" }] }] }] },
        ],
      },
    ]);
    const out = sanitizeRichTextHtml(html);
    expect(out).toContain("<table");
    expect(out).toMatch(/<colgroup><col style="min-width:\s*25px"><\/colgroup>/);
    expect(out).toContain("<th");
    expect(out).toContain("H1");
    expect(out).toContain("<td");
    expect(out).toContain("cell");
  });
});

describe("sanitizeRichTextHtml -- security payloads (original 20-payload battery)", () => {
  const payloads: Record<string, string> = {
    script: "<script>alert(1)</script>",
    scriptInAttrObfuscated: '<p>text</p><scr<script>ipt>alert(1)</scr</script>ipt>',
    onerrorImg: '<img src=x onerror=alert(1)>',
    onloadSvg: "<svg onload=alert(1)></svg>",
    svgAnchorJs: '<svg><a xlink:href="javascript:alert(1)"><text>click</text></a></svg>',
    iframe: '<iframe src="javascript:alert(1)"></iframe>',
    object: '<object data="javascript:alert(1)"></object>',
    embed: '<embed src="javascript:alert(1)">',
    formaction: '<form><button formaction="javascript:alert(1)">go</button></form>',
    jsHref: '<a href="javascript:alert(1)">click</a>',
    jsHrefCase: '<a href="JaVaScRiPt:alert(1)">click</a>',
    vbscriptHref: '<a href="vbscript:msgbox(1)">click</a>',
    dataUriScript: '<a href="data:text/html,<script>alert(1)</script>">click</a>',
    styleExpression: '<p style="width:expression(alert(1))">x</p>',
    styleUrlJs: '<p style="background:url(javascript:alert(1))">x</p>',
    mathmlVector: "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></mtext></math>",
    detailsOntoggle: "<details ontoggle=alert(1) open>x</details>",
    bodyOnload: "<body onload=alert(1)>",
    base: '<base href="javascript:alert(1)//">',
    metaRefresh: '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  };

  for (const [name, html] of Object.entries(payloads)) {
    it(`neutralizes: ${name}`, () => {
      const out = sanitizeRichTextHtml(html).toLowerCase();
      expect(out).not.toMatch(/<script/);
      expect(out).not.toMatch(/on(error|load|click|toggle)\s*=/);
      expect(out).not.toMatch(/javascript:/);
      expect(out).not.toMatch(/vbscript:/);
      expect(out).not.toMatch(/<iframe/);
      expect(out).not.toMatch(/<object/);
      expect(out).not.toMatch(/<embed/);
      expect(out).not.toMatch(/expression\(/);
    });
  }
});

describe("sanitizeRichTextHtml -- additional payloads for the 3 remediated findings", () => {
  it("removes an <input> that is not type=checkbox (text)", () => {
    const out = sanitizeRichTextHtml('<input type="text" value="x" onfocus="alert(1)">');
    expect(out).not.toMatch(/<input/i);
  });

  it("removes an <input> that is not type=checkbox (password)", () => {
    const out = sanitizeRichTextHtml('<input type="password" name="pw">');
    expect(out).not.toMatch(/<input/i);
  });

  it("removes an <input> with no type attribute at all (defaults to text)", () => {
    const out = sanitizeRichTextHtml('<label><input value="x"></label>');
    expect(out).not.toMatch(/<input/i);
  });

  it("keeps a genuine checkbox input but strips its event-handler attribute and forces it disabled", () => {
    const out = sanitizeRichTextHtml('<label><input type="checkbox" checked onclick="alert(1)"><span></span></label>');
    expect(out).toMatch(/<input type="checkbox"/i);
    expect(out).toMatch(/disabled="disabled"/i);
    expect(out).not.toMatch(/onclick/i);
    expect(out).not.toMatch(/alert\(/);
  });

  it("rejects a malicious formaction-style attribute smuggled onto a checkbox", () => {
    const out = sanitizeRichTextHtml('<input type="checkbox" formaction="javascript:alert(1)">');
    expect(out).not.toMatch(/formaction/i);
    expect(out).not.toMatch(/javascript:/i);
  });

  it("strips malicious attributes on <table> (onmouseover) while keeping the table", () => {
    const out = sanitizeRichTextHtml('<table onmouseover="alert(1)"><tbody><tr><td>x</td></tr></tbody></table>');
    expect(out).not.toMatch(/onmouseover/i);
    expect(out).not.toMatch(/alert\(/);
    expect(out).toContain("<table");
    expect(out).toContain("<td>x</td>");
  });

  it("strips malicious attributes on <colgroup>/<col> (onclick, style with expression)", () => {
    const out = sanitizeRichTextHtml(
      '<table><colgroup onclick="alert(1)"><col style="width:expression(alert(2))"></colgroup><tbody><tr><td>x</td></tr></tbody></table>'
    );
    expect(out).not.toMatch(/onclick/i);
    expect(out).not.toMatch(/expression\(/i);
    expect(out).not.toMatch(/alert\(/);
    expect(out).toContain("<colgroup>");
    expect(out).toContain("<col>");
  });

  it("CSS expression() in style is dropped, not passed through in any form", () => {
    const out = sanitizeRichTextHtml('<p style="width:expression(alert(1))">x</p>');
    expect(out).not.toMatch(/expression/i);
    expect(out).not.toMatch(/style=/i);
  });

  it("CSS url(javascript:...) in style is dropped, not passed through in any form", () => {
    const out = sanitizeRichTextHtml('<p style="background:url(javascript:alert(1))">x</p>');
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/url\(/i);
    expect(out).not.toMatch(/style=/i);
  });

  it("rejects arbitrary CSS properties not in the allowlist (e.g. behavior, position, content)", () => {
    const out = sanitizeRichTextHtml('<p style="behavior: url(evil.htc); position: fixed; content: \'x\'">x</p>');
    expect(out).not.toMatch(/style=/i);
  });

  it("keeps a legitimate text-align declaration but drops an illegitimate one appended to it", () => {
    const out = sanitizeRichTextHtml('<p style="text-align: center; behavior: url(evil.htc)">x</p>');
    expect(out).toMatch(/style="text-align:\s*center"/);
    expect(out).not.toMatch(/behavior/i);
  });

  it("keeps a legitimate min-width declaration on col but drops an appended dangerous one", () => {
    // A bare <col> outside a <table><colgroup> is discarded by HTML parsing
    // rules (foster parenting), independent of any sanitizer policy --
    // confirmed directly against DOMPurify.sanitize() before writing this
    // test. Wrap it in its real structural context, matching what
    // generateHTML() actually produces, so this test exercises the style
    // policy rather than an artifact of an invalid fragment.
    const out = sanitizeRichTextHtml(
      '<table><colgroup><col style="min-width: 25px; width: expression(alert(1))"></colgroup></table>'
    );
    expect(out).toMatch(/style="min-width:\s*25px"/);
    expect(out).not.toMatch(/expression/i);
  });

  it("rejects a text-align value that isn't one of the known keywords", () => {
    const out = sanitizeRichTextHtml('<p style="text-align: url(javascript:alert(1))">x</p>');
    expect(out).not.toMatch(/style=/i);
    expect(out).not.toMatch(/javascript:/i);
  });
});

describe("confirmed sinks call sanitizeRichTextHtml (static shape)", () => {
  const tabsSource = readFileSync(join(repoRoot, "app/(app)/clients/[id]/ClientWorkspaceTabs.tsx"), "utf8");
  const taskRowSource = readFileSync(join(repoRoot, "app/(app)/engagements/[id]/TaskRow.tsx"), "utf8");

  it("TaskRow.tsx wraps task.description with sanitizeRichTextHtml before dangerouslySetInnerHTML", () => {
    expect(taskRowSource).toMatch(/import \{ sanitizeRichTextHtml \} from "@\/lib\/sanitizeRichTextHtml"/);
    expect(taskRowSource).toMatch(/dangerouslySetInnerHTML=\{\{\s*__html:\s*sanitizeRichTextHtml\(task\.description\)\s*\}\}/);
  });

  it("ClientWorkspaceTabs.tsx wraps client task description (t.description) with sanitizeRichTextHtml", () => {
    expect(tabsSource).toMatch(/import \{ sanitizeRichTextHtml \} from "@\/lib\/sanitizeRichTextHtml"/);
    expect(tabsSource).toMatch(/dangerouslySetInnerHTML=\{\{\s*__html:\s*sanitizeRichTextHtml\(t\.description\)\s*\}\}/);
  });

  it("ClientWorkspaceTabs.tsx wraps note body (n.body) with sanitizeRichTextHtml", () => {
    expect(tabsSource).toMatch(/dangerouslySetInnerHTML=\{\{\s*__html:\s*sanitizeRichTextHtml\(n\.body\)\s*\}\}/);
  });

  it("does not touch the other 13 dangerouslySetInnerHTML surfaces (custom CSS/HTML/schema_markup/legal content)", () => {
    // Spot-check a representative sample of the out-of-scope surfaces named
    // in the render-surface audit -- these must still render their raw
    // field directly, unchanged, since they have a separate trust model
    // (staff-authored template CSS/HTML, not task/note rich text).
    const untouched: Array<[string, RegExp]> = [
      ["components/site/sections/CustomHtmlSection.tsx", /dangerouslySetInnerHTML=\{\{\s*__html:\s*config\.html\s*\}\}/],
      ["components/legal/LegalDocumentBody.tsx", /dangerouslySetInnerHTML=\{\{\s*__html:\s*introHtml\s*\}\}/],
      ["components/organizer/PublicOrganizerForm.tsx", /dangerouslySetInnerHTML=\{\{\s*__html:\s*template\.custom_css\s*\}\}/],
    ];
    for (const [file, pattern] of untouched) {
      const source = readFileSync(join(repoRoot, file), "utf8");
      expect(source, `${file} should be unmodified by this fix`).toMatch(pattern);
      expect(source, `${file} should not import sanitizeRichTextHtml`).not.toMatch(/sanitizeRichTextHtml/);
    }
  });

  it("PortalTaskItem.tsx remains plain JSX text interpolation, not dangerouslySetInnerHTML", () => {
    const source = readFileSync(join(repoRoot, "components/portal/PortalTaskItem.tsx"), "utf8");
    expect(source).not.toMatch(/dangerouslySetInnerHTML/);
    expect(source).toMatch(/\{task\.description\}/);
  });
});
