-- The section library (hero, rich text, image, testimonial, FAQ, lead form,
-- CTA, spacer, footer) covers curated layouts but has no way to drop in
-- arbitrary markup -- a raw embed code (Calendly, a tracking pixel, a
-- custom layout someone designed elsewhere). Adds "custom_html" as a plain
-- staff-authored HTML block, same trust model as pasting an embed code into
-- any other website builder: it renders (and its <script> tags execute)
-- exactly as written, only on the published public page -- see
-- CustomHtmlSection.tsx for the script re-execution and SectionPreview.tsx
-- for why the staff-facing builder canvas deliberately does NOT execute it.
alter table public.site_page_sections drop constraint site_page_sections_section_type_check;
alter table public.site_page_sections add constraint site_page_sections_section_type_check
  check (section_type = any (array[
    'hero', 'rich_text', 'image', 'text_image', 'testimonial',
    'faq', 'lead_form', 'cta_button', 'spacer', 'footer', 'custom_html'
  ]));
