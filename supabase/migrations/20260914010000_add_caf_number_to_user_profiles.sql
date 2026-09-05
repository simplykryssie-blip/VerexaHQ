-- CAF (Centralized Authorization File) number -- the IRS-issued id for a
-- designee/POA holder, needed on forms like 8821/2848. Unlike PTIN/EIN this
-- isn't treated as a secret (it's routinely shared with the IRS and clients
-- to identify who's authorized), so it's a plain column, not an
-- encrypted/masked one like ptin_encrypted.
alter table public.user_profiles add column if not exists caf_number text;
