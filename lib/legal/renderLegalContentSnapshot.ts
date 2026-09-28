import { TERMS_INTRO_HTML, TERMS_SECTIONS, PRIVACY_INTRO_HTML, PRIVACY_SECTIONS, type LegalSection } from "@/lib/legal/legalContent";

function sectionsToHtml(introHtml: string, sections: LegalSection[]): string {
  const sectionsHtml = sections
    .map((section) => {
      const blocksHtml = section.blocks
        .map((block) => (block.type === "list" ? `<ul>${block.items.map((item) => `<li>${item}</li>`).join("")}</ul>` : `<p>${block.html}</p>`))
        .join("");
      return `<h2>${section.title}</h2><div>${blocksHtml}</div>`;
    })
    .join("");
  return `<p>${introHtml}</p>${sectionsHtml}`;
}

// The single canonical source for what gets archived: the exact same plain
// data (lib/legal/legalContent.ts) that /terms and /privacy render, turned
// into a plain HTML string. No React/react-dom involved, so this is safe to
// import from a Route Handler -- see legalContent.ts for why that matters.
export function renderCurrentLegalContentSnapshot(): { termsHtml: string; privacyHtml: string } {
  return {
    termsHtml: sectionsToHtml(TERMS_INTRO_HTML, TERMS_SECTIONS),
    privacyHtml: sectionsToHtml(PRIVACY_INTRO_HTML, PRIVACY_SECTIONS),
  };
}
