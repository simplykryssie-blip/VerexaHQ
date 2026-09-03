alter view public.compliance_failed_logins_view set (security_invoker = true);
alter view public.compliance_security_events_view set (security_invoker = true);
alter view public.compliance_pending_reviews_view set (security_invoker = true);
alter view public.compliance_shared_engagements_view set (security_invoker = true);
alter view public.compliance_mfa_status_view set (security_invoker = true);
alter view public.compliance_sensitive_data_reveals_view set (security_invoker = true);
alter view public.compliance_permission_changes_view set (security_invoker = true);
alter view public.compliance_consent_status_view set (security_invoker = true);

create or replace function public.compliance_inactive_users(p_workspace_id uuid, p_inactive_since interval default '30 days')
returns table (
  workspace_id uuid,
  user_id uuid,
  display_name text,
  role_name text,
  last_seen_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select wu.workspace_id, wu.user_id, up.display_name, r.name, up.last_seen_at
  from public.workspace_users wu
  join public.user_profiles up on up.id = wu.user_id
  join public.roles r on r.id = wu.role_id
  where wu.workspace_id = p_workspace_id
    and wu.status = 'active'
    and (up.last_seen_at is null or up.last_seen_at < now() - p_inactive_since);
$$;
