-- A client_portal_users identity is never also a workspace_users one (see
-- the boundary documented on lib/portal.ts). But create_workspace had no
-- check for this -- any authenticated user, including a client, could call
-- it (directly via RPC, or by navigating to /onboarding, which has no
-- server-side guard) and become the owner of a brand-new staff workspace.
-- A misrouted confirmation-email redirect just proved this reachable in
-- practice: a client landed on "Set up your firm" after verifying their
-- email. Block it at the source, not just in the frontend routing.
create or replace function public.create_workspace(p_name text, p_workspace_type text default 'independent_ptin'::text, p_timezone text default 'America/New_York'::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
  v_owner_role_id uuid;
  v_slug text;
  v_suffix int := 0;
begin
  if auth.uid() is null then
    raise exception 'create_workspace requires an authenticated user';
  end if;

  if exists (select 1 from public.client_portal_users where user_id = auth.uid() and status = 'active') then
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
  values (p_name, v_slug, p_workspace_type, p_timezone, auth.uid(), (select email from auth.users where id = auth.uid()))
  returning id into v_workspace_id;

  insert into public.workspace_users (workspace_id, user_id, role_id, is_owner, status, joined_at)
  values (v_workspace_id, auth.uid(), v_owner_role_id, true, 'active', now());

  insert into public.branding (workspace_id, display_name)
  values (v_workspace_id, p_name);

  insert into public.workspace_feature_flags (workspace_id, feature_flag_id, is_enabled)
  select v_workspace_id, id, true from public.feature_flags where is_core;

  insert into public.lead_stages (workspace_id, key, label, display_order, is_entry_stage)
  values
    (v_workspace_id, 'lead', 'Lead', 0, true),
    (v_workspace_id, 'consult_scheduled', 'Consult Scheduled', 1, false),
    (v_workspace_id, 'proposal_sent', 'Proposal Sent', 2, false);

  perform public.copy_preloaded_templates_to_workspace(v_workspace_id);

  update public.user_profiles set default_workspace_id = v_workspace_id
  where id = auth.uid() and default_workspace_id is null;

  return v_workspace_id;
end;
$$;
