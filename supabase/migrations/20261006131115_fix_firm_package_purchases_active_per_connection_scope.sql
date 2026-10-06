-- Repeat-purchase fix: an existing active/past_due purchase on a connection
-- must no longer block a legitimate new purchase (upgrade, add-on license,
-- renewal) from being recorded. The old index covered status in
-- ('pending','active','past_due'), so any non-canceled purchase permanently
-- blocked every future purchase on that connection. Scoping it to 'pending'
-- only preserves the real invariant this index exists for -- at most one
-- checkout in flight per connection at a time -- without blocking
-- legitimate repeat/additional purchases once the prior one has settled.
--
-- Validated in verexahq-test (see incident validation): existing active
-- purchase no longer blocks a new one, duplicate webhook delivery stays
-- idempotent via firm_package_purchases_external_payment_uidx (untouched,
-- not part of this change), a third/additional purchase succeeds and keeps
-- all purchases on one Firm Connection, two simultaneous pending purchases
-- for the same connection are still rejected by this index, and
-- firm_package.purchased automations still fire exactly once per
-- legitimate pending -> active transition.
drop index if exists public.firm_package_purchases_active_per_connection;

create unique index firm_package_purchases_active_per_connection
  on public.firm_package_purchases (connection_id)
  where status = 'pending';
