-- Contacts Pass 2: client_addresses had no structured field for
-- apartment/suite/unit/room information -- it was either lost or manually
-- concatenated into the single `street` free-text field at the user's
-- discretion. Purely additive: a nullable street2 column, no existing
-- `street` values touched or rewritten.
alter table public.client_addresses add column if not exists street2 text;
