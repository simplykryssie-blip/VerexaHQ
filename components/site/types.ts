export type SiteBranding = {
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  support_email: string | null;
  support_phone: string | null;
  display_name: string | null;
} | null;

export type SiteWebsiteInfo = {
  id: string;
  name: string;
  favicon_url: string | null;
  head_tracking_code: string | null;
  body_tracking_code: string | null;
  /** CSS background for the logo header -- null keeps the default plain white/light header. Lets a dark-themed site (e.g. a sidebar-logo variant meant for a dark background) show its logo without clashing against white. */
  header_background: string | null;
};

export type FunnelPageRef = { id: string; slug: string; title: string; position: number };
export type SiteFunnel = { id: string; name: string; pages: FunnelPageRef[] } | null;

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
  website: SiteWebsiteInfo;
  page: {
    id: string;
    title: string;
    meta_description: string | null;
    background_color: string | null;
    custom_css: string | null;
    custom_js: string | null;
    schema_markup: string | null;
  };
  branding: SiteBranding;
  funnel: SiteFunnel;
  sections: SiteSection[];
};
