import { HeroSection } from "@/components/site/sections/HeroSection";
import { RichTextSection } from "@/components/site/sections/RichTextSection";
import { ImageSection } from "@/components/site/sections/ImageSection";
import { TextImageSection } from "@/components/site/sections/TextImageSection";
import { TestimonialSection } from "@/components/site/sections/TestimonialSection";
import { FaqSection } from "@/components/site/sections/FaqSection";
import { CtaButtonSection } from "@/components/site/sections/CtaButtonSection";
import { SpacerSection } from "@/components/site/sections/SpacerSection";
import { FooterSection } from "@/components/site/sections/FooterSection";
import type { BuilderSection } from "./types";

// Reuses the real public-facing section components for everything except
// lead_form and custom_html. lead_form calls a real lead-capture RPC on
// submit, which must never fire from an unsaved staff preview. custom_html
// re-executes arbitrary staff-pasted <script> tags -- fine on the actual
// public page (own content, own audience), but the canvas below renders
// inside the authenticated staff app, so running untrusted script there
// would be a real privilege escalation. Both get a static stand-in instead.
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
    case "lead_form": {
      const cfg = section.config as { heading?: string; subheading?: string };
      return (
        <section className="mx-auto max-w-lg px-6 py-12">
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
            {cfg.heading && <h2 className="text-xl font-semibold text-ink">{cfg.heading}</h2>}
            {cfg.subheading && <p className="mt-1 text-sm text-muted">{cfg.subheading}</p>}
            <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">
              Lead capture form -- preview only, not submittable here.
            </p>
          </div>
        </section>
      );
    }
    case "custom_html":
      return (
        <section className="mx-auto max-w-5xl px-6 py-8">
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">
            Custom HTML block -- preview only, code runs live on the published page.
          </div>
        </section>
      );
    default:
      return null;
  }
}
