import DOMPurify from "isomorphic-dompurify";

// Security boundary for rendering stored rich-text HTML (task descriptions,
// note bodies) via dangerouslySetInnerHTML. These values come from
// RichTextEditor (Tiptap) and are written by any authenticated workspace
// staff member -- never trust them as safe HTML at render time. Prior
// write-side "sanitization" (a regex-based tag strip used only as an
// empty-content check in AddForms.tsx/AddTaskForm.tsx/FirmDetailClient.tsx)
// never touched the stored value and provided no protection; this is the
// actual control point.
//
// isomorphic-dompurify (not plain dompurify) because these render sites are
// "use client" components that Next.js still server-renders once before
// hydration -- plain dompurify requires a browser `window` and throws under
// Node SSR. isomorphic-dompurify transparently uses jsdom on the server and
// real DOMPurify in the browser.
//
// The allowlist covers exactly what Tiptap's StarterKit + Underline +
// TextAlign + Table/TaskList extensions can produce (see
// components/settings/RichTextEditor.tsx), verified against the extensions'
// actual generateHTML() output -- nothing broader. No <script>, no
// event-handler attributes (onerror, onclick, ...), no javascript: URLs:
// DOMPurify strips all of these by construction once they're excluded from
// the allowlist below.
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "code",
  "pre",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "hr",
  "a",
  "span",
  "div",
  "table",
  "colgroup",
  "col",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  // Tiptap's TaskList/TaskItem extensions render a checkbox as
  // <li data-type="taskItem"><label><input type="checkbox" ...><span/></label>...
  // -- see the uponSanitizeElement hook below, which is what actually
  // restricts <input> to exactly this shape (type="checkbox" only, and
  // forced non-interactive). ALLOWED_TAGS alone cannot express "only a
  // checkbox input", so it must not be trusted as the sole control point
  // for these two tags.
  "label",
  "input",
];

const ALLOWED_ATTR = [
  "href",
  "target",
  "rel",
  "class",
  "style",
  "data-checked",
  "data-type",
  "colspan",
  "rowspan",
  // input/checkbox support (see the uponSanitizeElement hook below for the
  // actual type restriction -- these attribute *names* are harmless on
  // their own; it is the value of `type` that must be constrained).
  "type",
  "checked",
  "disabled",
];

// DOMPurify does not itself validate CSS *values* inside the style
// attribute -- confirmed directly: `style="width:expression(alert(1))"`
// and `style="background:url(javascript:alert(1))"` both survive
// DOMPurify.sanitize() unchanged with `style` in ALLOWED_ATTR and no
// further handling. RichTextEditor only ever needs two declarations
// (TextAlign on paragraphs/headings, and the Table extension's per-column
// min-width hint on <table>/<col>), so instead of trusting `style` as
// free-form text, every declaration is re-parsed and only kept if both its
// property name and its value match one of these narrow, explicit patterns.
// This is a property allowlist, not a general-purpose CSS parser: unknown
// properties (or a recognized property with an unexpected value shape,
// including any use of url(), expression(), or javascript:) are dropped
// entirely, never partially repaired.
const ALLOWED_STYLE_PROPERTIES: Record<string, RegExp> = {
  "text-align": /^(left|right|center|justify)$/i,
  "min-width": /^\d+(\.\d+)?(px|em|rem|%)$/i,
};

function sanitizeStyleAttributeValue(value: string): string {
  return value
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separatorIndex = declaration.indexOf(":");
      if (separatorIndex === -1) return null;
      const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
      const propertyValue = declaration.slice(separatorIndex + 1).trim();
      const pattern = ALLOWED_STYLE_PROPERTIES[property];
      if (!pattern || !pattern.test(propertyValue)) return null;
      return `${property}: ${propertyValue}`;
    })
    .filter((declaration): declaration is string => declaration !== null)
    .join("; ");
}

// Hooks are registered once, at module load, directly on the shared
// DOMPurify instance -- the officially documented mechanism for
// attribute/element-level policy that ALLOWED_TAGS/ALLOWED_ATTR alone
// cannot express (a CSS-property-and-value policy for `style`, and
// restricting <input> to exactly type="checkbox"). Neither hook invents a
// general HTML or CSS sanitizer: each only narrows what the base allowlist
// above already permits.
DOMPurify.addHook("uponSanitizeAttribute", (_currentNode, hookEvent) => {
  if (hookEvent.attrName !== "style") return;
  hookEvent.attrValue = sanitizeStyleAttributeValue(hookEvent.attrValue);
  if (!hookEvent.attrValue) hookEvent.keepAttr = false;
});

DOMPurify.addHook("uponSanitizeElement", (currentNode, hookEvent) => {
  if (hookEvent.tagName !== "input") return;
  const element = currentNode as Element;
  const type = element.getAttribute("type")?.toLowerCase();
  if (type !== "checkbox") {
    // Not the task-item checkbox this allowlist exists for -- e.g. a
    // password/text/hidden/file input smuggled in as stored "rich text".
    // Drop the element outright rather than trying to coerce or repair it.
    element.remove();
    return;
  }
  // This HTML is rendered read-only via dangerouslySetInnerHTML, outside
  // Tiptap's own editor -- force the checkbox non-interactive so it can't
  // be toggled in a view that has no handler wired to persist the change.
  element.setAttribute("disabled", "disabled");
});

/**
 * Sanitizes stored rich-text HTML for safe use in dangerouslySetInnerHTML.
 * Strips script elements, event-handler attributes, javascript:/data: URLs,
 * non-allowlisted CSS in the style attribute, and any <input> that isn't a
 * disabled checkbox -- while preserving normal RichTextEditor formatting
 * (bold/italic/underline, headings, lists, task-list checkboxes, links,
 * tables with column sizing, text alignment).
 *
 * Apply this at every render site that feeds staff- or client-authored
 * rich text into dangerouslySetInnerHTML -- do not apply it globally to
 * unrelated dangerouslySetInnerHTML uses (custom CSS/HTML template
 * surfaces have their own, separate trust model).
 */
export function sanitizeRichTextHtml(html: string): string {
  // No custom ALLOWED_URI_REGEXP -- DOMPurify's own default already
  // restricts href/src schemes to http(s)/mailto/tel/relative and rejects
  // javascript:, data:, and other executable URI schemes. Overriding it
  // with a hand-rolled pattern would be exactly the kind of homegrown
  // sanitization logic this fix is meant to replace.
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
