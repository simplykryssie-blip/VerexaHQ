-- Home's content was already strong and is left untouched (see the sibling
-- migration rebuilding About/Pricing/Get Started) -- but it was archived
-- along with the rest of the site on 2026-08-25, which meant the bare
-- verexahq.com domain redirected every logged-out visitor straight to
-- /dashboard (app/page.tsx falls back there when get_public_site_page
-- returns null). Republishing it so the site is live end-to-end again.
update public.site_pages set status = 'published' where id = 'b75cbf39-2ab3-4fef-822a-18b476338ffc';
