"use client";

// Renders staff-pasted HTML for real inside the staff-facing builder canvas
// -- unlike SectionPreview's other cases, this one actually needs the code
// to run so staff can see it work (an embed, a script-driven widget) while
// they're building. Safe to do only because of the sandbox attribute: with
// "allow-scripts" but *not* "allow-same-origin", the iframe's content lives
// on a unique opaque origin with no access to this page's cookies, session,
// or DOM -- a malicious or just broken snippet can run its own script, but
// it can't touch anything belonging to the authenticated staff app around it.
export function SandboxedHtmlPreview({ html }: { html: string }) {
  return (
    <iframe
      srcDoc={html}
      sandbox="allow-scripts"
      title="Custom HTML preview"
      className="h-[420px] w-full rounded-lg border border-dashed border-border bg-white"
    />
  );
}
