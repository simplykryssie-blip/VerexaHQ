-- Two gaps found via advisors after the preceding migrations in this batch:
-- 1. sync_sent_at was missing `set search_path`, unlike every other
--    trigger function in this codebase.
-- 2. create_client_relationship / reveal_client_relationship_ssn /
--    flip_lead_on_organizer_submission were left executable by `anon`,
--    unlike create_client / reveal_client_ssn which this codebase already
--    explicitly revokes anon from (see revoke_anon_explicit migration).

create or replace function public.sync_sent_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.status = 'sent' and new.sent_at is null then
    new.sent_at := now();
  elsif new.status = 'draft' then
    new.sent_at := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.create_client_relationship(uuid, uuid, text, text, uuid, date, text) from anon;
revoke execute on function public.reveal_client_relationship_ssn(uuid) from anon;
revoke execute on function public.flip_lead_on_organizer_submission() from anon, authenticated;
