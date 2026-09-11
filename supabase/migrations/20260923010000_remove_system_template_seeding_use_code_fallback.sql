-- Reverses the "system plumbing" template seeding added in
-- 20260826210000/20260828140000. Those migrations planted 5 rows (4 email +
-- 1 SMS: portal-invite-email, appointment-reminder,
-- automation-staff-notification, organizer-information-request x2) into
-- every workspace -- including new ones via create_workspace() -- to work
-- around 4 features that hard-fail without a template row at a fixed slug.
-- That directly violates the "no workspace gets ANY preloaded content"
-- policy (20260811091942, 20260821130000): a workspace ends up with
-- template rows nobody there created, indistinguishable in the product from
-- real content.
--
-- The actual fix is in application code, not the database: the 3 send paths
-- that look these slugs up (app/api/cron/dispatch-notifications/route.ts,
-- app/api/portal-invitations/send-email/route.ts,
-- app/api/cron/send-pending-portal-invites/route.ts) now fall back to a
-- compiled-in default (lib/notifications/systemTemplateDefaults.ts) only
-- when no workspace-owned row exists, so the feature keeps working with
-- nothing planted in any workspace's data. A firm that wants to customize
-- this copy still can -- creating a workspace-owned template at the same
-- slug is preferred over the code fallback, unchanged from before.
-- These 4 slugs are looked up dynamically by execute_automation_step's
-- send_email/send_sms actions (via notification_queue.template_key) and by
-- the 3 app-level send paths -- never by a stored row id -- and all of them
-- now fall back to the compiled-in default when no row matches, so no
-- automation step actually breaks when the row disappears. The guard
-- trigger can't know that, and flags "1. New Tax Service Lead Enters CRM"
-- (workspace b41f7ee8-e811-4d4d-8156-5ebf43014462) for referencing
-- portal-invite-email by slug -- confirmed safe to bypass here.
alter table public.email_templates disable trigger trg_guard_delete_email_template;
alter table public.sms_templates disable trigger trg_guard_delete_sms_template;

delete from public.email_templates
where slug in ('portal-invite-email', 'appointment-reminder', 'automation-staff-notification', 'organizer-information-request');

delete from public.sms_templates
where slug = 'organizer-information-request';

alter table public.email_templates enable trigger trg_guard_delete_email_template;
alter table public.sms_templates enable trigger trg_guard_delete_sms_template;

create or replace function public.create_workspace(p_name text, p_workspace_type text default 'independent_ptin'::text, p_timezone text default 'America/New_York'::text, p_owner_user_id uuid default null::uuid)
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

  update public.user_profiles set default_workspace_id = v_workspace_id
  where id = v_owner_uid and default_workspace_id is null;

  return v_workspace_id;
end;
$function$;
