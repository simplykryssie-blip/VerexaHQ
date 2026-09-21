-- Migration Reconciliation Phase 1.10A -- recovered from production.
--
-- Adds 'packages' as an allowed site_page_sections.section_type value.
-- Main's latest constraint (20260915000000_public_pricing_table_section.sql,
-- real production version 20260913...) stops at 'pricing_table' -- this is
-- the next value added on top, live in production, with zero representation
-- in main.
--
-- Confidence: A -- exact original recovered from
-- supabase_migrations.schema_migrations.statements (byte-for-byte).
alter table public.site_page_sections drop constraint site_page_sections_section_type_check;
alter table public.site_page_sections add constraint site_page_sections_section_type_check
  check (section_type = any(array['hero', 'rich_text', 'image', 'text_image', 'testimonial', 'faq', 'organizer_form', 'cta_button', 'spacer', 'footer', 'custom_html', 'booking_widget', 'pricing_table', 'packages']));
