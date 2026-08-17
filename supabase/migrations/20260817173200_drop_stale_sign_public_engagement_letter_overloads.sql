-- create or replace function with new parameters isn't a true replace when
-- the argument list changes shape (Postgres identifies functions by name +
-- argument types) -- 20260817210000 left the original 6/7-arg overloads of
-- sign_public_engagement_letter[_with_signup] live alongside the new 8-arg
-- ones, which would make a call by name ambiguous. Same class of bug this
-- repo already hit once with create_engagement (see
-- drop_stale_create_engagement_overload).
drop function if exists public.sign_public_engagement_letter(uuid, text, text, text, text, text);
drop function if exists public.sign_public_engagement_letter_with_signup(uuid, text, text, text, text, text, uuid);
