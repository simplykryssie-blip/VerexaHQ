-- Closes public self-serve signup before opening for testing, at the
-- user's explicit request: she wants every new workspace provisioned by
-- her (email + account tier), with the invitee only setting a password --
-- not a form anyone can find and use to spin up their own firm.
--
-- create_workspace already did everything a fresh workspace needs (owner
-- membership, branding row, core feature flags, preloaded templates) --
-- extended here with an optional p_owner_user_id so a platform-admin
-- provisioning route (service-role only) can create a workspace on behalf
-- of a user who was just invited and hasn't logged in yet (no auth.uid()
-- of their own). Guarded so only a service-role caller can pass it; an
-- ordinary session can't use it to create a workspace for someone else
-- even if EXECUTE were ever mistakenly re-granted.
--
-- Adding a parameter changes the function's signature, so `create or
-- replace` on the new 4-arg form would leave the old 3-arg one behind as a
-- separate overload (same trap as the stale create_engagement overload
-- fixed earlier this project) -- drop it explicitly first.
drop function if exists public.create_workspace(text, text, text);

create or replace function public.create_workspace(
  p_name text,
  p_workspace_type text default 'independent_ptin',
  p_timezone text default 'America/New_York',
  p_owner_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_owner_role_id uuid;
  v_slug text;
  v_suffix int := 0;
  v_owner_uid uuid;
begin
  if p_owner_user_id is not null then
    if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
      raise exception 'p_owner_user_id can only be set by a service-role caller';
    end if;
    v_owner_uid := p_owner_user_id;
  else
    v_owner_uid := auth.uid();
  end if;

  if v_owner_uid is null then
    raise exception 'create_workspace requires an authenticated user';
  end if;

  if exists (select 1 from public.client_portal_users where user_id = v_owner_uid and status = 'active') then
    raise exception 'this account is a client portal account and cannot create a staff workspace';
  end if;

  select id into v_owner_role_id from public.roles where workspace_id is null and slug = 'owner';
  if v_owner_role_id is null then
    raise exception 'system owner role is not seeded';
  end if;

  v_slug := regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  if v_slug = '' then
    v_slug := 'workspace';
  end if;
  while exists (select 1 from public.workspaces where slug = v_slug || case when v_suffix = 0 then '' else '-' || v_suffix end) loop
    v_suffix := v_suffix + 1;
  end loop;
  if v_suffix > 0 then
    v_slug := v_slug || '-' || v_suffix;
  end if;

  insert into public.workspaces (name, slug, workspace_type, timezone, created_by, primary_contact_email)
  values (p_name, v_slug, p_workspace_type, p_timezone, v_owner_uid, (select email from auth.users where id = v_owner_uid))
  returning id into v_workspace_id;

  insert into public.workspace_users (workspace_id, user_id, role_id, is_owner, status, joined_at)
  values (v_workspace_id, v_owner_uid, v_owner_role_id, true, 'active', now());

  insert into public.branding (workspace_id, display_name)
  values (v_workspace_id, p_name);

  insert into public.workspace_feature_flags (workspace_id, feature_flag_id, is_enabled)
  select v_workspace_id, id, true from public.feature_flags where is_core;

  perform public.copy_preloaded_templates_to_workspace(v_workspace_id);

  update public.user_profiles set default_workspace_id = v_workspace_id
  where id = v_owner_uid and default_workspace_id is null;

  return v_workspace_id;
end;
$function$;

-- Postgres grants EXECUTE to PUBLIC by default on every newly-created
-- function -- since the drop+recreate above makes this a fresh function as
-- far as the grant system is concerned, that default has to be revoked
-- explicitly or it silently supersedes the per-role revokes below.
revoke execute on function public.create_workspace(text, text, text, uuid) from public;
revoke execute on function public.create_workspace(text, text, text, uuid) from authenticated;
revoke execute on function public.create_workspace(text, text, text, uuid) from anon;
grant execute on function public.create_workspace(text, text, text, uuid) to service_role;
