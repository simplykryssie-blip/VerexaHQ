import type { LegalSection } from "@/lib/legal/legalContent";

// Renders the shared plain-data legal content (lib/legal/legalContent.ts) as
// real markup on /terms and /privacy -- the same data
// lib/legal/renderLegalContentSnapshot.ts turns into a plain HTML string for
// the acceptance archive, so there is only ever one copy of the text itself.
export function LegalDocumentBody({ introHtml, sections }: { introHtml: string; sections: LegalSection[] }) {
  return (
    <>
      <p className="mt-6 text-sm leading-relaxed text-slate" dangerouslySetInnerHTML={{ __html: introHtml }} />
      {sections.map((section) => (
        <section className="mt-10" key={section.title}>
          <h2 className="text-lg font-semibold text-ink">{section.title}</h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate">
            {section.blocks.map((block, i) =>
              block.type === "list" ? (
                <ul className="list-disc space-y-1 pl-5" key={i}>
                  {block.items.map((item, j) => (
                    <li key={j} dangerouslySetInnerHTML={{ __html: item }} />
                  ))}
                </ul>
              ) : (
                <p key={i} dangerouslySetInnerHTML={{ __html: block.html }} />
              )
            )}
          </div>
        </section>
      ))}
    </>
  );
}
