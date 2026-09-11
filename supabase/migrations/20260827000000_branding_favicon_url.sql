-- One-Logo White-Label Branding: logo_url becomes the single source of
-- truth a workspace uploads once; sidebar_logo_url/portal_logo_url stay as
-- Advanced-only per-surface overrides (already fall back to logo_url when
-- unset, per getEffectiveBranding). favicon_url is a small, square,
-- upload-time-generated derivative of logo_url (padded onto a square canvas,
-- capped size) -- browsers need a real static image for the tab icon, not
-- something re-derived client-side per page load the way the sidebar's
-- transparent-padding trim already is.
alter table public.branding add column if not exists favicon_url text;
