-- stripe_payment_link_id (plink_...) is for matching checkout.session.completed's
-- payment_link field -- it is NOT the clickable buy.stripe.com URL, and the two
-- cannot be derived from each other (confirmed: Stripe's Payment Link "url" field
-- is a separate, unrelated slug from its API id). A "Purchase Now" button needs
-- the actual URL, so store it explicitly rather than attempting to reconstruct it.
alter table public.firm_packages
  add column if not exists stripe_payment_link_url text;

comment on column public.firm_packages.stripe_payment_link_url is 'The actual clickable Stripe Payment Link URL (https://buy.stripe.com/...), copy-pasted from the Stripe Dashboard -- used for the public "Purchase Now" button. Distinct from stripe_payment_link_id (plink_... used only for webhook matching), which cannot be converted into this URL or vice versa.';
