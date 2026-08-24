export type SiteBranding = {
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  support_email: string | null;
  support_phone: string | null;
  display_name: string | null;
} | null;

export type FunnelPageRef = { id: string; slug: string; title: string; position: number };
export type SiteFunnel = { id: string; name: string; pages: FunnelPageRef[] } | null;

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

export type SiteSection = {
  id: string;
  section_type: SectionType;
  display_order: number;
  // Shape depends on section_type -- see each section-editor/section-renderer
  // component for the fields it actually reads from this.
  config: Record<string, unknown>;
};

export type SitePageData = {
  workspace_id: string;
  page: { id: string; title: string; meta_description: string | null };
  branding: SiteBranding;
  funnel: SiteFunnel;
  sections: SiteSection[];
};
