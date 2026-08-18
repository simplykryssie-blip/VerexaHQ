// Matches the empty <div data-page-break> marker (lib/tiptap/pageBreak.ts)
// in either its self-closing or content-wrapping serialized form.
export const PAGE_BREAK_HTML_RE = /<div[^>]*\bdata-page-break\b[^>]*>[\s\S]*?<\/div>|<div[^>]*\bdata-page-break\b[^>]*\/?>/gi;

/** Splits a letter's body_html into per-page HTML fragments at each
 * page-break marker, for a real one-page-at-a-time viewer instead of a
 * single scrolling document with a divider line. Always returns at least
 * one page. */
export function splitPagesByBreak(html: string): string[] {
  const pages = (html ?? "")
    .split(PAGE_BREAK_HTML_RE)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return pages.length > 0 ? pages : [html ?? ""];
}
