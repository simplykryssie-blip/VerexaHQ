-- Any preloaded (workspace_id IS NULL) template row across the 4 template
-- tables is now automatically copied into a workspace as an editable,
-- deletable, workspace-owned row -- both at signup (via create_workspace)
-- and, once, backfilled here for existing workspaces. The copy keeps the
-- master's slug/status, so it's found first by every lookup that already
-- prefers workspace-owned over the shared default (portal invite email,
-- the reminder/notification dispatcher) -- no consumer code needs to
-- change. The shared master row is left in place as the seed source for
-- future workspaces.
create or replace function public.copy_preloaded_templates_to_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.email_templates (workspace_id, name, slug, subject, body_html, status, category, merge_fields, schedule_rule)
  select p_workspace_id, name, slug, subject, body_html, status, category, merge_fields, schedule_rule
  from public.email_templates src
  where src.workspace_id is null
    and not exists (
      select 1 from public.email_templates own
      where own.workspace_id = p_workspace_id and own.slug = src.slug
    );

  insert into public.sms_templates (workspace_id, name, slug, body, status, merge_fields, schedule_rule)
  select p_workspace_id, name, slug, body, status, merge_fields, schedule_rule
  from public.sms_templates src
  where src.workspace_id is null
    and not exists (
      select 1 from public.sms_templates own
      where own.workspace_id = p_workspace_id and own.slug = src.slug
    );

  insert into public.organizer_templates (workspace_id, name, slug, description, status, requires_portal_signup, is_public)
  select p_workspace_id, name, slug, description, status, requires_portal_signup, is_public
  from public.organizer_templates src
  where src.workspace_id is null
    and not exists (
      select 1 from public.organizer_templates own
      where own.workspace_id = p_workspace_id and own.slug = src.slug
    );

  insert into public.engagement_letter_templates (workspace_id, name, slug, body_html, status, requires_signature, requires_portal_signup, is_public, merge_fields)
  select p_workspace_id, name, slug, body_html, status, requires_signature, requires_portal_signup, is_public, merge_fields
  from public.engagement_letter_templates src
  where src.workspace_id is null
    and not exists (
      select 1 from public.engagement_letter_templates own
      where own.workspace_id = p_workspace_id and own.slug = src.slug
    );
end;
$$;

revoke all on function public.copy_preloaded_templates_to_workspace(uuid) from public, anon, authenticated;

-- Hook into workspace creation, right before returning the new workspace id.
-- NOTE: this repo's local supabase/migrations/ history is missing the
-- migrations that originally defined create_workspace (they exist only in
-- the live project, starting at bootstrap_workspace_on_signup /
-- 20260806222502) -- this CREATE OR REPLACE reproduces the full live body
-- verbatim (pulled via pg_get_functiondef) plus the one new line calling
-- copy_preloaded_templates_to_workspace, rather than a partial diff against
-- a local definition that doesn't exist in this checkout.
create or replace function public.create_workspace(p_name text, p_workspace_type text default 'independent_ptin'::text, p_timezone text default 'America/New_York'::text)
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
begin
  if auth.uid() is null then
    raise exception 'create_workspace requires an authenticated user';
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
$function$;

-- Backfill: every workspace that already exists gets caught up now too.
do $$
declare
  ws record;
begin
  for ws in select id from public.workspaces loop
    perform public.copy_preloaded_templates_to_workspace(ws.id);
  end loop;
end $$;
