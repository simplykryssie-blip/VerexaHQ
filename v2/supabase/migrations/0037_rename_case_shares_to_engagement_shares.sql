-- Revision Sprint -- terminology finalization: Case/Job -> Engagement.
--
-- case_shares had no dependents yet (its case_id column was always a
-- forward reference with no FK, waiting on the Jobs/Cases table that Phase 3
-- was going to add) so renaming now, before the Engagement Management
-- Engine builds the real table, is free -- there is nothing else to break.
-- Table/column renames preserve all existing rows, constraints, and
-- indexes; the three RPCs are recreated because their bodies embed the old
-- table/column names as literal SQL text, which a bare rename would not
-- have updated.

-- 0035 added new permission keys (identity.itin_reveal, engagements.archive/
-- approve_review/share, data.export, templates.manage, security.manage) but
-- only granted them to the specific new roles that needed them -- unlike
-- Phase 0's original seed, Owner/Admin do not automatically inherit newly
-- added permissions, so without this they'd be locked out of the very
-- checks this migration adds (e.g. engagements.share below).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.workspace_id is null and r.slug = 'owner'
  and p.key in (
    'engagements.archive', 'engagements.approve_review', 'engagements.share',
    'data.export', 'templates.manage', 'security.manage'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.workspace_id is null and r.slug = 'admin'
  and p.key in (
    'engagements.archive', 'engagements.approve_review', 'engagements.share',
    'data.export', 'templates.manage', 'security.manage'
  )
on conflict do nothing;

-- ERO keeps its existing engagements.* authority and gains the new ones too.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.workspace_id is null and r.slug = 'ero'
  and p.key in ('engagements.archive', 'engagements.approve_review', 'engagements.share')
on conflict do nothing;

alter table public.case_shares rename to engagement_shares;
alter table public.engagement_shares rename column case_id to engagement_id;

alter index case_shares_case_idx rename to engagement_shares_engagement_idx;
alter index case_shares_workspace_idx rename to engagement_shares_workspace_idx;
alter index case_shares_shared_with_idx rename to engagement_shares_shared_with_idx;

alter trigger audit_case_shares on public.engagement_shares rename to audit_engagement_shares;

alter policy case_shares_select on public.engagement_shares rename to engagement_shares_select;

comment on table public.engagement_shares is 'A PTIN''s Engagement shared with one connected ERO for review. shared_items = {"intake_forms","documents","notes","messages","billing","prior_year_returns"} booleans. The PTIN always owns the Engagement; the share is a temporary, revocable grant, not a transfer.';
comment on column public.engagement_shares.engagement_id is 'References the future public.engagements table (Engagement Management Engine). No FK yet -- that table doesn''t exist.';

drop function public.share_case_with_ero(uuid, uuid, uuid, jsonb, integer);
drop function public.respond_to_case_share(uuid, boolean, text);
drop function public.expire_stale_case_shares();

create or replace function public.share_engagement_with_ero(
  p_engagement_id uuid,
  p_workspace_id uuid,
  p_shared_with_workspace_id uuid,
  p_shared_items jsonb default '{}'::jsonb,
  p_expires_in_days integer default 30
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'insufficient permissions to share an engagement from this workspace';
  end if;
  if not public.has_permission(p_workspace_id, 'engagements.share') then
    raise exception 'insufficient permissions to share engagements from this workspace';
  end if;
  if not exists (
    select 1 from public.firm_connections
    where relationship_type = 'ero_ptin' and status = 'active'
      and child_workspace_id = p_workspace_id and parent_workspace_id = p_shared_with_workspace_id
  ) then
    raise exception 'no active ERO connection to share this engagement with';
  end if;

  insert into public.engagement_shares (engagement_id, workspace_id, shared_with_workspace_id, shared_items, shared_by, expires_at)
  values (p_engagement_id, p_workspace_id, p_shared_with_workspace_id, coalesce(p_shared_items, '{}'::jsonb), auth.uid(), now() + make_interval(days => p_expires_in_days))
  returning id into v_id;

  return v_id;
end;
$$;
comment on function public.share_engagement_with_ero(uuid, uuid, uuid, jsonb, integer) is 'A PTIN shares one Engagement with a connected ERO, choosing exactly what to expose (never the full client).';

revoke execute on function public.share_engagement_with_ero(uuid, uuid, uuid, jsonb, integer) from public, anon;
grant execute on function public.share_engagement_with_ero(uuid, uuid, uuid, jsonb, integer) to authenticated;

create or replace function public.respond_to_engagement_share(
  p_engagement_share_id uuid,
  p_approve boolean,
  p_decision_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ero_workspace_id uuid;
begin
  select shared_with_workspace_id into v_ero_workspace_id from public.engagement_shares where id = p_engagement_share_id;
  if v_ero_workspace_id is null then
    raise exception 'engagement share not found';
  end if;
  if not public.is_workspace_member(v_ero_workspace_id) then
    raise exception 'insufficient permissions to respond to this engagement share';
  end if;
  if not public.has_permission(v_ero_workspace_id, 'engagements.approve_review') then
    raise exception 'insufficient permissions to approve or reject engagement reviews';
  end if;

  update public.engagement_shares set
    status = case when p_approve then 'approved' else 'rejected' end,
    decision_notes = p_decision_notes,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_engagement_share_id;
end;
$$;
comment on function public.respond_to_engagement_share(uuid, boolean, text) is 'The connected ERO reviews a shared Engagement: approve, comment via decision_notes (used for "request changes" too), or reject.';

revoke execute on function public.respond_to_engagement_share(uuid, boolean, text) from public, anon;
grant execute on function public.respond_to_engagement_share(uuid, boolean, text) to authenticated;

create or replace function public.expire_stale_engagement_shares()
returns integer
language sql
security definer
set search_path = public
as $$
  with expired as (
    update public.engagement_shares
    set status = 'expired'
    where status = 'pending' and expires_at < now()
    returning id
  )
  select count(*)::integer from expired;
$$;
comment on function public.expire_stale_engagement_shares() is 'Maintenance sweep for a scheduled job (pg_cron, added in a later phase): marks past-due pending shares as expired.';

revoke execute on function public.expire_stale_engagement_shares() from public, anon, authenticated;
