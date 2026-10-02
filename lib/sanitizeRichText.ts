import DOMPurify from "isomorphic-dompurify";

// VEREXA-XSS-001: single authoritative sanitizer for notes.body and
// tasks.description. These columns are written directly by the browser
// (supabase.from("notes"/"tasks").insert/update -- see AddForms.tsx,
// AddTaskForm.tsx) and by the server-side automation engine's create_task
// action, with no server-side gate in between and no DB-side sanitization.
// Render time is the one point every value passes through regardless of
// how it got stored, so this is called immediately before each of the
// three dangerouslySetInnerHTML sinks (NotesTab, TasksTab in
// ClientWorkspaceTabs.tsx; TaskRow.tsx) instead of trusting any writer.
//
// isomorphic-dompurify selects real browser DOMPurify in the browser and a
// jsdom-backed instance on the server, so this one call is safe during
// both Next.js SSR and client hydration -- these three sinks are "use
// client" components but still render once on the server before
// hydrating. Nothing here runs under the Edge runtime (confirmed: no
// `app/(app)` route declares `export const runtime = "edge"`), so the
// jsdom dependency this package pulls in is not a build-breaking concern
// the way @vercel/functions's websocket helper was for VEREXA-ENV-001.
//
// The allowlist mirrors exactly what the notes/tasks RichTextEditor
// instance can produce (components/settings/RichTextEditor.tsx, called
// via InlineAddForm's "richtext" field with no allowPageBreak -- so no
// table/checklist/page-break extensions load for this field type):
// StarterKit's blocks/marks, the Link mark, and TextAlign's
// `style="text-align: ..."` output. No image, iframe, SVG, embed, form,
// or script support exists in that editor and none is added here.
const ALLOWED_TAGS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
  "code",
  "ul",
  "ol",
  "li",
  "hr",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "a",
];

const ALLOWED_ATTR = ["href", "style"];

// Only https/http/mailto schemes, or a scheme-less (relative) URL --
// narrower than DOMPurify's own default (which also allows ftp, tel,
// callto, sms, cid, xmpp), matching exactly what this editor's Link mark
// is ever used for and rejecting javascript:, data:, vbscript:, and any
// other scheme outright.
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto):|[^a-z]|[a-z0-9+.-]+(?:[^a-z+.-:]|$))/i;

// The only CSS TextAlign ever emits (lib: @tiptap/extension-text-align).
// Allowing the bare `style` attribute without this would let arbitrary
// CSS (including dangerous url()/expression() values) through under
// cover of "legitimate formatting" -- this hook constrains it to exactly
// that one property/value shape and drops the attribute entirely
// otherwise, rather than trusting DOMPurify's generic attribute allowlist
// to also police the attribute's *value*.
const TEXT_ALIGN_STYLE = /^text-align\s*:\s*(left|right|center|justify)\s*;?\s*$/i;

let hookInstalled = false;
function ensureTextAlignHook() {
  if (hookInstalled) return;
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName === "style" && !TEXT_ALIGN_STYLE.test(data.attrValue.trim())) {
      data.keepAttr = false;
    }
  });
  hookInstalled = true;
}

/**
 * Sanitizes stored notes.body / tasks.description HTML immediately before
 * it's passed to dangerouslySetInnerHTML. Safe to call with null/undefined
 * (returns ""). See VEREXA-XSS-001.
 */
export function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return "";
  ensureTextAlignHook();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP,
  });
}
