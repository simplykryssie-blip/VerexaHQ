-- Allows a "booking_widget" section on Websites/Funnels pages, embedding the
-- public booking flow directly into a page instead of only sharing it as a
-- standalone link.
alter table public.site_page_sections drop constraint site_page_sections_section_type_check;
alter table public.site_page_sections add constraint site_page_sections_section_type_check
  check (section_type = any (array['hero','rich_text','image','text_image','testimonial','faq','organizer_form','cta_button','spacer','footer','custom_html','booking_widget']));
