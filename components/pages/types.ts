export type SectionType =
  | "hero"
  | "rich_text"
  | "image"
  | "text_image"
  | "testimonial"
  | "faq"
  | "organizer_form"
  | "cta_button"
  | "spacer"
  | "footer"
  | "custom_html"
  | "booking_widget";

export type BuilderSection = {
  id: string;
  section_type: SectionType;
  display_order: number;
  config: Record<string, unknown>;
};

export type BuilderPage = {
  id: string;
  workspace_id: string;
  title: string;
  slug: string;
  meta_description: string | null;
  status: string;
  funnel_id: string | null;
  background_color: string | null;
  custom_css: string | null;
  custom_js: string | null;
  schema_markup: string | null;
};

export type OrganizerTemplateOption = { id: string; name: string; is_public: boolean; public_token: string };
export type BookableServiceOption = { id: string; name: string };
export type StaffOption = { id: string; label: string };

export const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  hero: "Hero",
  rich_text: "Rich text",
  image: "Image",
  text_image: "Text + image",
  testimonial: "Testimonial",
  faq: "FAQ",
  organizer_form: "Form",
  cta_button: "CTA button",
  spacer: "Spacer",
  footer: "Footer",
  custom_html: "Custom HTML",
  booking_widget: "Booking widget",
};

export const SECTION_TYPES: SectionType[] = [
  "hero",
  "text_image",
  "rich_text",
  "image",
  "testimonial",
  "faq",
  "organizer_form",
  "booking_widget",
  "cta_button",
  "spacer",
  "footer",
  "custom_html",
];
