-- Native "Packages / services" Website Builder section type -- lets a
-- workspace select 1+ of its own published firm_packages onto a public
-- page, no HTML required. Follows the exact existing booking_widget
-- pattern: config stores only { package_ids: string[] } (never copied
-- package data), the public renderer (PackagesSection.tsx) resolves current
-- package rows live via a workspace-scoped API route
-- (app/api/public/packages/route.ts) at render time, and the in-builder
-- preview renders directly from the already workspace-scoped `packages`
-- list the page route already fetches -- same shape as `services` for
-- booking_widget.
alter table public.site_page_sections drop constraint site_page_sections_section_type_check;
alter table public.site_page_sections add constraint site_page_sections_section_type_check
  check (section_type = any(array['hero', 'rich_text', 'image', 'text_image', 'testimonial', 'faq', 'organizer_form', 'cta_button', 'spacer', 'footer', 'custom_html', 'booking_widget', 'pricing_table', 'packages']));
