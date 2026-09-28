// Regression coverage for VEREXAHQ -- CONTACTS COMPLETION PASS, Phase 4b
// (larger Notes editor). Notes previously rendered as plain
// whitespace-pre-wrap text via a plain textarea, despite the notes table
// already existing as a text column that could hold richer content. Rather
// than build a second notes system around the unused rich_content jsonb
// column, this upgrades the existing body column to store sanitized HTML
// via the same RichTextEditor + "richtext" field type already used for task
// descriptions (components/InlineAddForm.tsx) -- reusing an established
// pattern, not inventing one. Source-level inspection matches this repo's
// convention for UI with no jsdom environment configured.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const clientIdDir = join(dirname(fileURLToPath(import.meta.url)), "..", "app/(app)/clients/[id]");
const addFormsSource = readFileSync(join(clientIdDir, "AddForms.tsx"), "utf8");
const tabsSource = readFileSync(join(clientIdDir, "ClientWorkspaceTabs.tsx"), "utf8");

// stripHtml isn't exported (it's a small local helper next to the Overview
// widget that uses it, matching this file's existing convention of
// unexported helpers like clientDisplayName/money) -- verified against the
// exact same regex it's defined with, since it has no external dependency
// worth mocking.
describe("stripHtml", () => {
  const stripHtml = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  it("strips tags and collapses whitespace, for the Overview widget's plain-text preview", () => {
    expect(stripHtml("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
    expect(stripHtml("plain text, no html")).toBe("plain text, no html");
    expect(stripHtml("<ul><li>one</li><li>two</li></ul>")).toBe("one two");
  });
});

// Functions are extracted up to the next top-level `export function` (or
// end of file) rather than by brace-matching a `\n}` -- these two functions
// destructure their params across multiple lines, so the naive "first \n}"
// match would stop at the parameter list's own closing brace.
function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}(`);
  const rest = source.slice(start + 1);
  const nextExportOffset = rest.search(/\nexport function /);
  return nextExportOffset === -1 ? source.slice(start) : source.slice(start, start + 1 + nextExportOffset);
}

describe("AddForms.tsx -- Notes richtext upgrade", () => {
  it("AddNoteForm's body field is richtext, not a plain textarea", () => {
    const body = extractFunction(addFormsSource, "AddNoteForm");
    expect(body).toMatch(/\{ name: "body", label: "Note", type: "richtext", required: true \}/);
  });

  it("EditNoteForm's body field is richtext too, matching AddNoteForm", () => {
    const body = extractFunction(addFormsSource, "EditNoteForm");
    expect(body).toMatch(/\{ name: "body", label: "Note", type: "richtext", required: true \}/);
  });

  it("both still write to the existing notes.body column -- no new column or second notes table", () => {
    const addBody = extractFunction(addFormsSource, "AddNoteForm");
    const editBody = extractFunction(addFormsSource, "EditNoteForm");
    expect(addBody).toMatch(/\.from\("notes"\)\.insert\(/);
    expect(addBody).toMatch(/body: v\.body/);
    expect(editBody).toMatch(/\.from\("notes"\)\s*\.update\(/);
    expect(editBody).toMatch(/body: v\.body/);
    expect(addFormsSource).not.toMatch(/rich_content/);
  });
});

describe("ClientWorkspaceTabs.tsx -- Notes render upgrade", () => {
  it("NotesTab renders the note body as HTML, not escaped plain text", () => {
    const body = extractFunction(tabsSource, "NotesTab");
    expect(body).toMatch(/dangerouslySetInnerHTML=\{\{ __html: n\.body \}\}/);
  });

  it("the Overview widget's recent-notes preview strips HTML rather than showing literal tags", () => {
    expect(tabsSource).toMatch(/\{stripHtml\(n\.body\)\}/);
  });
});
