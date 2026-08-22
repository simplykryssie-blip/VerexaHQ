-- workspace_security_policies.password_min_length (default 12) was set in
-- Settings but never read by the actual validator (hardcoded 8-char rule),
-- and record_login_attempt/is_account_locked were correctly-written RPCs
-- that nothing ever called -- login_history stayed empty despite active
-- use. This migration doesn't touch the policy table or those two RPCs
-- (both already correct); it threads password_min_length through the
-- pre-auth flows that create/set a password for a specific, already-known
-- workspace, and adds two thin wrapper RPCs so the generic (pre-workspace)
-- login pages can check/record lockout by email without needing a
-- workspace_id or an existing session.

-- Public organizer intake signup
create or replace function public.get_public_organizer_template(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_template record;
  v_result jsonb;
begin
  select ot.id, ot.name, ot.description, ot.workspace_id, ot.requires_portal_signup, w.name as workspace_name
  into v_template
  from public.organizer_templates ot
  join public.workspaces w on w.id = ot.workspace_id
  where ot.public_token = p_token and ot.is_public = true and ot.status = 'published';

  if v_template.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'template', jsonb_build_object('id', v_template.id, 'name', v_template.name, 'description', v_template.description),
    'workspace_name', v_template.workspace_name,
    'requires_portal_signup', v_template.requires_portal_signup,
    'password_min_length', coalesce((select password_min_length from public.workspace_security_policies where workspace_id = v_template.workspace_id), 8),
    'branding', (
      select jsonb_build_object(
        'logo_url', coalesce(b.portal_logo_url, b.sidebar_logo_url),
        'primary_color', b.primary_color,
        'secondary_color', b.secondary_color,
        'support_email', b.support_email,
        'support_phone', b.support_phone
      )
      from public.branding b
      where b.workspace_id = v_template.workspace_id
    ),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'field_type', f.field_type, 'label', f.label, 'help_text', f.help_text,
        'display_order', f.display_order, 'is_required', f.is_required, 'options', f.options,
        'parent_field_id', f.parent_field_id, 'conditional_logic', f.conditional_logic,
        'body_html', f.body_html, 'client_profile_field', f.client_profile_field
      ) order by f.display_order)
      from public.organizer_fields f
      where f.organizer_template_id = v_template.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

-- Public engagement letter signup
create or replace function public.get_public_engagement_letter_template(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row record;
begin
  select elt.id, elt.name, elt.body_html, elt.requires_signature, elt.requires_portal_signup, elt.workspace_id,
         w.name as workspace_name, w.name as firm_name, w.mailing_address as firm_address, w.phone as firm_phone
  into v_row
  from public.engagement_letter_templates elt
  join public.workspaces w on w.id = elt.workspace_id
  where elt.public_token = p_token and elt.is_public = true and elt.status = 'published';

  if v_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'template', jsonb_build_object('id', v_row.id, 'name', v_row.name, 'body_html', v_row.body_html, 'requires_signature', v_row.requires_signature),
    'workspace_name', v_row.workspace_name,
    'firm_name', v_row.firm_name,
    'firm_address', v_row.firm_address,
    'firm_phone', v_row.firm_phone,
    'requires_portal_signup', v_row.requires_portal_signup,
    'password_min_length', coalesce((select password_min_length from public.workspace_security_policies where workspace_id = v_row.workspace_id), 8)
  );
end;
$function$;

-- Portal invitation acceptance -- RETURNS TABLE column list is changing, so
-- CREATE OR REPLACE won't work here (Postgres only allows that when the OUT
-- parameter row type is unchanged); drop and recreate, then re-grant.
drop function if exists public.get_portal_invitation_preview(uuid);
create function public.get_portal_invitation_preview(p_token uuid)
returns table(invited_email citext, invited_name text, status text, token_expires_at timestamptz, client_label text, password_min_length int)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select cpu.invited_email, cpu.invited_name, cpu.status, cpu.token_expires_at,
    coalesce(c.business_name, trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,''))),
    coalesce((select password_min_length from public.workspace_security_policies where workspace_id = c.workspace_id), 8)
  from public.client_portal_users cpu
  join public.clients c on c.id = cpu.client_id
  where cpu.invitation_token = p_token;
$function$;
grant execute on function public.get_portal_invitation_preview(uuid) to anon, authenticated;

-- Staff workspace invitation acceptance -- same reason for drop+recreate.
drop function if exists public.get_invitation_preview(uuid);
create function public.get_invitation_preview(p_token uuid)
returns table(email text, status text, expires_at timestamptz, workspace_name text, role_name text, account_exists boolean, password_min_length int)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    wi.email,
    wi.status,
    wi.expires_at,
    w.name,
    r.name,
    exists (select 1 from auth.users u where lower(u.email) = lower(wi.email)),
    coalesce((select password_min_length from public.workspace_security_policies where workspace_id = wi.workspace_id), 8)
  from public.workspace_invitations wi
  join public.workspaces w on w.id = wi.workspace_id
  join public.roles r on r.id = wi.role_id
  where wi.token = p_token;
$function$;
grant execute on function public.get_invitation_preview(uuid) to anon, authenticated;

-- Generic (pre-workspace) login pages can't know a workspace_id or a
-- user_id up front -- these two thin wrappers resolve the user by email
-- (same lookup pattern get_invitation_preview already uses against
-- auth.users) and delegate to the existing, already-correct
-- is_account_locked/record_login_attempt. Returning {locked:false} for an
-- unknown email is deliberate: it reveals nothing beyond "this email, if
-- it exists, isn't currently locked," which is normal login UX, not an
-- enumeration leak.
create or replace function public.check_login_lockout(p_email text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid;
  v_locked_until timestamptz;
begin
  select id into v_user_id from auth.users where lower(email) = lower(p_email);
  if v_user_id is null then
    return jsonb_build_object('locked', false);
  end if;

  select locked_until into v_locked_until from public.user_profiles where id = v_user_id;
  if v_locked_until is not null and v_locked_until > now() then
    return jsonb_build_object('locked', true, 'locked_until', v_locked_until);
  end if;

  return jsonb_build_object('locked', false);
end;
$function$;

create or replace function public.record_login_result(p_email text, p_success boolean, p_workspace_id uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(p_email);
  if v_user_id is null then
    return;
  end if;

  perform public.record_login_attempt(v_user_id, p_workspace_id, p_success);
end;
$function$;

grant execute on function public.check_login_lockout(text) to anon, authenticated;
grant execute on function public.record_login_result(text, boolean, uuid) to anon, authenticated;
