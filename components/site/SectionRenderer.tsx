"use client";

import type { SiteSection, SiteFunnel } from "./types";
import { HeroSection } from "./sections/HeroSection";
import { RichTextSection } from "./sections/RichTextSection";
import { ImageSection } from "./sections/ImageSection";
import { TextImageSection } from "./sections/TextImageSection";
import { TestimonialSection } from "./sections/TestimonialSection";
import { FaqSection } from "./sections/FaqSection";
import { OrganizerFormSection } from "./sections/OrganizerFormSection";
import { CtaButtonSection } from "./sections/CtaButtonSection";
import { SpacerSection } from "./sections/SpacerSection";
import { FooterSection } from "./sections/FooterSection";
import { CustomHtmlSection } from "./sections/CustomHtmlSection";
import { BookingWidgetSection } from "./sections/BookingWidgetSection";
import { PricingTableSection } from "./sections/PricingTableSection";
import { PreviewOnlyNotice } from "./sections/PreviewOnlyNotice";
import { SandboxedHtmlPreview } from "./sections/SandboxedHtmlPreview";

export function SectionRenderer({
  section,
  pageId,
  workspaceSlug,
  websiteSlug,
  funnel,
  accentColor,
  firmName,
  previewMode,
  customCss,
}: {
  section: SiteSection;
  pageId: string;
  workspaceSlug: string;
  websiteSlug: string;
  funnel: SiteFunnel;
  accentColor?: string;
  firmName: string | null;
  // True only for the staff-facing draft preview route (see
  // app/site-preview/[pageId]/page.tsx) -- swaps organizer_form/booking_widget
  // for a static notice so a preview can never fire a real submission, and
  // custom_html for the same sandboxed iframe the in-builder canvas uses
  // (SectionPreview.tsx/SandboxedHtmlPreview.tsx) rather than running
  // staff-pasted <script> tags directly against an authenticated session.
  previewMode?: boolean;
  // Only needed for the previewMode custom_html branch below -- the iframe's
  // srcDoc is a separate document that page.custom_css never reaches, unlike
  // the live page's own <head> injection (see PublicSitePage.tsx).
  customCss?: string | null;
}) {
  if (previewMode && section.section_type === "organizer_form") {
    const cfg = section.config as { template_name?: string };
    return (
      <PreviewOnlyNotice
        title={cfg.template_name || "Form"}
        note={cfg.template_name ? `"${cfg.template_name}" form -- preview only, not submittable here.` : "No form selected yet."}
      />
    );
  }
  if (previewMode && section.section_type === "booking_widget") {
    return <PreviewOnlyNotice title="Booking widget" note="Preview only -- not bookable here." />;
  }
  if (previewMode && section.section_type === "custom_html") {
    const cfg = section.config as { html?: string };
    if (!cfg.html) return null;
    return (
      <section className="mx-auto max-w-5xl px-6 py-8">
        <SandboxedHtmlPreview html={cfg.html} customCss={customCss} />
      </section>
    );
  }

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
    case "organizer_form":
      return (
        <OrganizerFormSection config={section.config as never} pageId={pageId} workspaceSlug={workspaceSlug} websiteSlug={websiteSlug} funnel={funnel} />
      );
    case "cta_button":
      return <CtaButtonSection config={section.config as never} accentColor={accentColor} />;
    case "spacer":
      return <SpacerSection config={section.config as never} />;
    case "footer":
      return <FooterSection config={section.config as never} firmName={firmName} />;
    case "custom_html":
      return <CustomHtmlSection config={section.config as never} />;
    case "booking_widget":
      return <BookingWidgetSection config={section.config as never} workspaceSlug={workspaceSlug} />;
    case "pricing_table":
      return <PricingTableSection config={section.config as never} />;
    default:
      return null;
  }
}
