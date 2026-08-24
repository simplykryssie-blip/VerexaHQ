export type SectionType =
  | "hero"
  | "rich_text"
  | "image"
  | "text_image"
  | "testimonial"
  | "faq"
  | "lead_form"
  | "cta_button"
  | "spacer"
  | "footer"
  | "custom_html";

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
};

export type WorkspaceServiceOption = { id: string; name: string };

export const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  hero: "Hero",
  rich_text: "Rich text",
  image: "Image",
  text_image: "Text + image",
  testimonial: "Testimonial",
  faq: "FAQ",
  lead_form: "Lead form",
  cta_button: "CTA button",
  spacer: "Spacer",
  footer: "Footer",
  custom_html: "Custom HTML",
};

export const SECTION_TYPES: SectionType[] = [
  "hero",
  "text_image",
  "rich_text",
  "image",
  "testimonial",
  "faq",
  "lead_form",
  "cta_button",
  "spacer",
  "footer",
  "custom_html",
];
