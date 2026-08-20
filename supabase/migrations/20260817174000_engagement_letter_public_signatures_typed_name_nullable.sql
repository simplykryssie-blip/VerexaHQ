-- Caught by synthetic testing before this reached real use: typed_name had
-- a pre-existing NOT NULL constraint, but 20260817172712 made it legitimately
-- optional once signature_type='drawn' (nothing typed at all in that case).
alter table public.engagement_letter_public_signatures alter column typed_name drop not null;
