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

export function SectionRenderer({
  section,
  pageId,
  workspaceSlug,
  websiteSlug,
  funnel,
  accentColor,
  firmName,
}: {
  section: SiteSection;
  pageId: string;
  workspaceSlug: string;
  websiteSlug: string;
  funnel: SiteFunnel;
  accentColor?: string;
  firmName: string | null;
}) {
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
    default:
      return null;
  }
}
