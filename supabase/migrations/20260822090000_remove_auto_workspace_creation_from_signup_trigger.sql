-- Real, separate self-serve hole found while retesting the /join fix:
-- handle_new_auth_user() -- a legacy trigger on auth.users, predating this
-- migration history (not defined in any local migration file, only ever
-- applied directly to the live project) -- auto-creates a full workspace
-- the instant ANY new auth.users row is inserted with a company_name (or
-- business_name) in its metadata, with zero invite validation and before
-- email confirmation even happens. This completely bypassed both
-- create_workspace's locked-down grants and the new
-- accept_firm_connection_invite invite check: /join's signup form sets
-- company_name at auth.signUp() time, so the workspace already existed by
-- the time /join's own code ran, and the invite was never actually
-- redeemed. Reproduced live in two separate test signups before being
-- found.
--
-- Fix: strip the workspace-bootstrap block out of this trigger entirely,
-- keeping only the user_profiles insert (harmless, needed for every new
-- login regardless of path). Workspace creation now exclusively goes
-- through create_workspace (platform-admin only) or
-- accept_firm_connection_invite (invite-gated) -- both already correct.
-- /join's "no membership yet" branch already calls
-- accept_firm_connection_invite when company_name is present, so removing
-- this trigger's auto-create doesn't change the user-visible flow for a
-- genuine invite acceptance -- it just removes the shortcut that skipped
-- invite validation.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_full_name text;
begin
  v_full_name := nullif(btrim(coalesce(new.raw_user_meta_data->>'first_name', '') || ' ' || coalesce(new.raw_user_meta_data->>'last_name', '')), '');

  insert into public.user_profiles (id, first_name, last_name, display_name)
  values (
    new.id,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    coalesce(new.raw_user_meta_data->>'display_name', v_full_name, new.email)
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;
