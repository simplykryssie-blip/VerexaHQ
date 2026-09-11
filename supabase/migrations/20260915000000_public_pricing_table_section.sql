-- Adds a real "pricing_table" section type that fetches live plan data at
-- render time, instead of typing prices into a custom_html block by hand.
-- The Home page's own duplicate pricing section (retired Independent
-- PTIN/ERO/Service Bureau tiers, stale rates) went stale the moment the
-- real Pricing page moved to Solo/Team/Firm -- a hand-typed price will
-- always eventually drift from whatever's actually configured in
-- Platform Admin > Plans. This section can't drift: it reads
-- platform_subscription_plans directly.
create or replace function public.get_public_platform_plans()
returns table (
  slug text,
  name text,
  base_price_cents integer,
  included_seats integer,
  per_seat_price_cents integer,
  signup_free_emails integer,
  signup_free_sms integer,
  signup_free_storage_gb numeric
)
language sql
security definer
set search_path to 'public'
stable
as $$
  select slug, name, base_price_cents, included_seats, per_seat_price_cents,
         signup_free_emails, signup_free_sms, signup_free_storage_gb
  from public.platform_subscription_plans
  where is_active = true
  order by base_price_cents asc;
$$;

revoke all on function public.get_public_platform_plans() from public;
grant execute on function public.get_public_platform_plans() to anon, authenticated;

alter table public.site_page_sections drop constraint site_page_sections_section_type_check;
alter table public.site_page_sections add constraint site_page_sections_section_type_check
  check (section_type = any (array['hero'::text, 'rich_text'::text, 'image'::text, 'text_image'::text, 'testimonial'::text, 'faq'::text, 'organizer_form'::text, 'cta_button'::text, 'spacer'::text, 'footer'::text, 'custom_html'::text, 'booking_widget'::text, 'pricing_table'::text]));
