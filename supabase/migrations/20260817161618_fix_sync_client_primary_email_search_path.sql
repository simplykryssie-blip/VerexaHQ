-- sync_client_primary_email casts to ::citext, but citext lives in the
-- extensions schema, not public. The function's search_path only included
-- public, so the very first non-matching primary-email write after
-- 20260817161223 shipped failed with "type citext does not exist"
-- (caught during synthetic testing, before this reached production use).
create or replace function public.sync_client_primary_email()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if new.is_primary then
    update public.clients
    set primary_email = new.email, normalized_email = lower(btrim(new.email::text))::citext, updated_at = now()
    where id = new.client_id;
  end if;
  return new;
end;
$function$;
