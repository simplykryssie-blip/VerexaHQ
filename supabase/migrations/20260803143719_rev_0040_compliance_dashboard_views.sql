create view public.compliance_failed_logins_view as
select
  lh.id, lh.user_id, up.display_name, lh.workspace_id, lh.ip_address, lh.user_agent, lh.failure_reason, lh.created_at
from public.login_history lh
left join public.user_profiles up on up.id = lh.user_id
where not lh.success;

create view public.compliance_security_events_view as
select id, workspace_id, actor_id, entity_type, entity_id, action, severity, metadata, created_at
from public.audit_log
where severity in ('warning', 'critical')
   or action in ('reveal_ssn', 'reveal_ein', 'reveal_itin', 'reveal_efin', 'reveal_ptin');

create view public.compliance_pending_reviews_view as
select id, engagement_id, workspace_id, shared_with_workspace_id, shared_items, shared_by, created_at, expires_at
from public.engagement_shares
where status = 'pending';

create view public.compliance_shared_engagements_view as
select id, engagement_id, workspace_id, shared_with_workspace_id, status, shared_by, reviewed_by, reviewed_at, decision_notes, created_at, expires_at
from public.engagement_shares;

create view public.compliance_mfa_status_view as
select wu.workspace_id, wu.user_id, up.display_name, up.mfa_enabled, up.mfa_enrolled_at, r.name as role_name
from public.workspace_users wu
join public.user_profiles up on up.id = wu.user_id
join public.roles r on r.id = wu.role_id
where wu.status = 'active';

create view public.compliance_sensitive_data_reveals_view as
select id, workspace_id, actor_id, entity_type, entity_id, action, created_at
from public.audit_log
where action like 'reveal_%';

create view public.compliance_permission_changes_view as
select id, workspace_id, actor_id, entity_type, entity_id, action, before_data, after_data, created_at
from public.audit_log
where entity_type in ('role_permissions', 'roles', 'workspace_users');

create view public.compliance_consent_status_view as
select id, workspace_id, user_id, client_id, consent_type, version, accepted_at
from public.consent_records;

comment on view public.compliance_failed_logins_view is 'Compliance Dashboard: recent failed login attempts.';
comment on view public.compliance_security_events_view is 'Compliance Dashboard: warning/critical audit events and sensitive-data reveals.';
comment on view public.compliance_pending_reviews_view is 'Compliance Dashboard: engagement shares awaiting ERO review.';
comment on view public.compliance_shared_engagements_view is 'Compliance Dashboard: full history of engagement sharing, any status.';
comment on view public.compliance_mfa_status_view is 'Compliance Dashboard: MFA enrollment status per active workspace user.';
comment on view public.compliance_sensitive_data_reveals_view is 'Compliance Dashboard: every SSN/EIN/ITIN/EFIN/PTIN reveal, who and when.';
comment on view public.compliance_permission_changes_view is 'Compliance Dashboard: role, role_permissions, and workspace_users (membership/role) changes.';
comment on view public.compliance_consent_status_view is 'Compliance Dashboard: consent acceptance history per user/client.';

revoke all on public.compliance_failed_logins_view from public, anon;
revoke all on public.compliance_security_events_view from public, anon;
revoke all on public.compliance_pending_reviews_view from public, anon;
revoke all on public.compliance_shared_engagements_view from public, anon;
revoke all on public.compliance_mfa_status_view from public, anon;
revoke all on public.compliance_sensitive_data_reveals_view from public, anon;
revoke all on public.compliance_permission_changes_view from public, anon;
revoke all on public.compliance_consent_status_view from public, anon;

grant select on public.compliance_failed_logins_view to authenticated;
grant select on public.compliance_security_events_view to authenticated;
grant select on public.compliance_pending_reviews_view to authenticated;
grant select on public.compliance_shared_engagements_view to authenticated;
grant select on public.compliance_mfa_status_view to authenticated;
grant select on public.compliance_sensitive_data_reveals_view to authenticated;
grant select on public.compliance_permission_changes_view to authenticated;
grant select on public.compliance_consent_status_view to authenticated;

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
as $$
  select wu.workspace_id, wu.user_id, up.display_name, r.name, up.last_seen_at
  from public.workspace_users wu
  join public.user_profiles up on up.id = wu.user_id
  join public.roles r on r.id = wu.role_id
  where wu.workspace_id = p_workspace_id
    and wu.status = 'active'
    and (up.last_seen_at is null or up.last_seen_at < now() - p_inactive_since);
$$;
comment on function public.compliance_inactive_users(uuid, interval) is 'Compliance Dashboard: active workspace users who haven''t been seen in p_inactive_since (default 30 days). RLS on the underlying tables still applies to the caller.';

revoke execute on function public.compliance_inactive_users(uuid, interval) from public, anon;
grant execute on function public.compliance_inactive_users(uuid, interval) to authenticated;
