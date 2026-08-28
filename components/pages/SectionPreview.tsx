import { HeroSection } from "@/components/site/sections/HeroSection";
import { RichTextSection } from "@/components/site/sections/RichTextSection";
import { ImageSection } from "@/components/site/sections/ImageSection";
import { TextImageSection } from "@/components/site/sections/TextImageSection";
import { TestimonialSection } from "@/components/site/sections/TestimonialSection";
import { FaqSection } from "@/components/site/sections/FaqSection";
import { CtaButtonSection } from "@/components/site/sections/CtaButtonSection";
import { SpacerSection } from "@/components/site/sections/SpacerSection";
import { FooterSection } from "@/components/site/sections/FooterSection";
import { SandboxedHtmlPreview } from "./SandboxedHtmlPreview";
import type { BuilderSection } from "./types";

// Reuses the real public-facing section components for everything except
// organizer_form, which gets a static stand-in -- it calls real lead-capture
// and organizer-submit RPCs, which must never fire from an unsaved staff
// preview. custom_html renders too, but sandboxed (see SandboxedHtmlPreview)
// rather than via the public page's own CustomHtmlSection, since that one
// re-runs staff-pasted <script> tags directly against the authenticated
// staff app.
export function SectionPreview({ section, accentColor }: { section: BuilderSection; accentColor?: string }) {
  switch (section.section_type) {
    case "hero":
      return <HeroSection config={section.config as never} accentColor={accentColor} />;
    case "rich_text":
      return <RichTextSection config={section.config as never} />;
    case "image":
      return <ImageSection config={section.config as never} />;
    case "text_image":
      return <TextImageSection config={section.config as never} />;
    case "testimonial":
      return <TestimonialSection config={section.config as never} />;
    case "faq":
      return <FaqSection config={section.config as never} />;
    case "cta_button":
      return <CtaButtonSection config={section.config as never} accentColor={accentColor} />;
    case "spacer":
      return <SpacerSection config={section.config as never} />;
    case "footer":
      return <FooterSection config={section.config as never} firmName={null} />;
    case "organizer_form": {
      const cfg = section.config as { template_name?: string };
      return (
        <section className="mx-auto max-w-lg px-6 py-12">
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
            <h2 className="text-xl font-semibold text-ink">{cfg.template_name || "Form"}</h2>
            <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">
              {cfg.template_name ? `"${cfg.template_name}" form -- preview only, not submittable here.` : "No form selected yet -- pick one in the panel on the right."}
            </p>
          </div>
        </section>
      );
    }
    case "custom_html": {
      const cfg = section.config as { html?: string };
      return (
        <section className="mx-auto max-w-5xl px-6 py-8">
          {cfg.html ? (
            <SandboxedHtmlPreview html={cfg.html} />
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">
              Custom HTML block -- paste some HTML to see it here.
            </div>
          )}
        </section>
      );
    }
    default:
      return null;
  }
}
