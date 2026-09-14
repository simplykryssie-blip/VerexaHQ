-- Phase 6E: Onboarding Source-of-Truth Reconciliation.
--
-- Closes the gap the Phase 6E audit found: firm_connections.onboarding_stage
-- (a plain, unguarded parent-admin dropdown) and partner_onboardings.status
-- (a richer, RPC/automation-driven lifecycle) could silently drift for the
-- same connection, with dashboards reading only the older field. This
-- migration does three things, and only three:
--
-- 1. Server-side enforcement that onboarding_stage can only be changed for
--    a manual/external connection (source = 'manual') -- the one population
--    it is still authoritative for.
-- 2. get_network_onboarding_summary rebuilt to report both populations
--    honestly, instead of forcing partner_onboardings' 8 statuses into the
--    old 4-stage vocabulary.
-- 3. get_network_stalled_partners rebuilt so a Verexa-workspace partner's
--    staleness is measured against their own current onboarding record's
--    activity, never the connection row's updated_at, and so terminal
--    states (ready/rejected/withdrawn) are never counted as stalled.
--
-- No status is added or removed anywhere. No firm_connections.onboarding_stage
-- value is modified, converted, or backfilled. No partner_onboardings row is
-- created for a connection that doesn't already have one. Phase 5B's
-- financial functions are untouched.

-- ---------------------------------------------------------------------------
-- 1. Server-side source-of-truth enforcement.
--
-- The only application write path to onboarding_stage is a raw
-- `.from("firm_connections").update(...)` call from PartnerDetails
-- (components/firms/FirmDetailClient.tsx), authorized purely by the existing
-- is_workspace_admin RLS policy -- RLS alone can't express "this column may
-- only change under this other column's value," so a narrow BEFORE UPDATE
-- trigger is the correct, smallest mechanism. It touches nothing else about
-- firm_connections' mutation architecture: every other column, and every
-- other update path, is completely unaffected.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_onboarding_stage_source_of_truth()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.onboarding_stage is distinct from old.onboarding_stage and old.source <> 'manual' then
    raise exception 'onboarding_stage can only be changed for a manual/external firm connection -- a VerexaHQ-workspace partner''s onboarding lifecycle is tracked in partner_onboardings, and an unredeemed invitation has no onboarding lifecycle yet';
  end if;
  return new;
end;
$function$;

drop trigger if exists enforce_onboarding_stage_source_of_truth on public.firm_connections;
create trigger enforce_onboarding_stage_source_of_truth
  before update on public.firm_connections
  for each row
  execute function public.enforce_onboarding_stage_source_of_truth();

-- ---------------------------------------------------------------------------
-- 2. get_network_onboarding_summary -- population-aware.
--
-- Return shape changes (the old 4-stage-only shape cannot honestly
-- represent partner_onboardings' 8 statuses without a fake mapping), so
-- this is a drop + recreate, not a CREATE OR REPLACE. Every known consumer
-- (only app/(app)/network-command-center/page.tsx) is updated in the same
-- phase.
--
-- pending_invitations_count is reported separately and is NEVER folded into
-- either onboarding breakdown -- an unredeemed workspace_invite connection
-- is a connection-lifecycle fact, not an onboarding-progress fact (Phase 6E
-- audit section 4/10).
-- ---------------------------------------------------------------------------
drop function if exists public.get_network_onboarding_summary(uuid);

create function public.get_network_onboarding_summary(p_workspace_id uuid)
returns table(
  pending_invitations_count integer,
  manual_invited_count integer,
  manual_agreement_signed_count integer,
  manual_software_provisioned_count integer,
  manual_live_count integer,
  manual_no_activity_14d_count integer,
  partner_pending_count integer,
  partner_in_progress_count integer,
  partner_under_review_count integer,
  partner_approved_count integer,
  partner_setup_count integer,
  partner_ready_count integer,
  partner_rejected_count integer,
  partner_withdrawn_count integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  return query
    with manual_conns as (
      select fc.onboarding_stage, fc.updated_at
      from public.firm_connections fc
      where fc.parent_workspace_id = p_workspace_id
        and fc.status = 'active'
        and fc.relationship_type = any(public.network_child_relationship_types(p_workspace_id))
        and fc.source = 'manual'
    ),
    -- Current/latest onboarding record per Verexa-workspace connection --
    -- the same "most recently created wins" rule already established by
    -- get_my_partner_onboarding and is_operationally_active_partner.
    current_onboarding as (
      select distinct on (po.firm_connection_id) po.status
      from public.partner_onboardings po
      join public.firm_connections fc on fc.id = po.firm_connection_id
      where fc.parent_workspace_id = p_workspace_id
        and fc.status = 'active'
        and fc.relationship_type = any(public.network_child_relationship_types(p_workspace_id))
        and fc.child_workspace_id is not null
      order by po.firm_connection_id, po.created_at desc
    )
    select
      (select count(*)::integer from public.firm_connections fc
         where fc.parent_workspace_id = p_workspace_id
           and fc.source = 'workspace_invite'
           and fc.child_workspace_id is null
           and fc.status = 'pending'),
      (select count(*) filter (where onboarding_stage = 'invited') from manual_conns)::integer,
      (select count(*) filter (where onboarding_stage = 'agreement_signed') from manual_conns)::integer,
      (select count(*) filter (where onboarding_stage = 'software_provisioned') from manual_conns)::integer,
      (select count(*) filter (where onboarding_stage = 'live') from manual_conns)::integer,
      (select count(*) filter (where onboarding_stage is distinct from 'live' and updated_at < now() - interval '14 days') from manual_conns)::integer,
      (select count(*) filter (where status = 'pending') from current_onboarding)::integer,
      (select count(*) filter (where status = 'in_progress') from current_onboarding)::integer,
      (select count(*) filter (where status = 'under_review') from current_onboarding)::integer,
      (select count(*) filter (where status = 'approved') from current_onboarding)::integer,
      (select count(*) filter (where status = 'setup') from current_onboarding)::integer,
      (select count(*) filter (where status = 'ready') from current_onboarding)::integer,
      (select count(*) filter (where status = 'rejected') from current_onboarding)::integer,
      (select count(*) filter (where status = 'withdrawn') from current_onboarding)::integer;
end;
$function$;

revoke all on function public.get_network_onboarding_summary(uuid) from public, anon;
grant execute on function public.get_network_onboarding_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. get_network_stalled_partners -- population-aware staleness.
--
-- Manual/external firms: unchanged rule (fc.updated_at, onboarding_stage
-- <> 'live'), now explicitly scoped to source = 'manual' rather than
-- incidentally including/excluding other rows by coincidence.
--
-- Verexa-workspace partners: staleness is measured against the current
-- onboarding record's own updated_at, never the connection row's -- the
-- connection row is not the onboarding activity record (Phase 6E audit
-- section 8/13). Terminal states (ready/rejected/withdrawn) can never be
-- "stalled onboarding": ready means finished, rejected/withdrawn mean the
-- lifecycle already ended -- counting them would inflate the number with
-- partners who need no further action at all.
--
-- Approved 14-day threshold is unchanged for both populations.
-- ---------------------------------------------------------------------------
drop function if exists public.get_network_stalled_partners(uuid, integer);

create function public.get_network_stalled_partners(
  p_workspace_id uuid,
  p_inactivity_days integer default 14
)
returns table(
  connection_id uuid,
  partner_name text,
  relationship_type text,
  population text,
  current_status text,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  return query
    select * from (
      select
        fc.id, coalesce(cw.name, fc.manual_name, 'Connected firm'), fc.relationship_type,
        'manual'::text, fc.onboarding_stage, fc.updated_at
      from public.firm_connections fc
      left join public.workspaces cw on cw.id = fc.child_workspace_id
      where fc.parent_workspace_id = p_workspace_id
        and fc.status = 'active'
        and fc.relationship_type = any(public.network_child_relationship_types(p_workspace_id))
        and fc.source = 'manual'
        and fc.onboarding_stage is distinct from 'live'
        and fc.updated_at < now() - (p_inactivity_days || ' days')::interval

      union all

      select
        fc.id, coalesce(cw.name, 'Connected firm'), fc.relationship_type,
        'workspace_partner'::text, po.status, po.updated_at
      from public.firm_connections fc
      join public.workspaces cw on cw.id = fc.child_workspace_id
      join lateral (
        select p.status, p.updated_at
        from public.partner_onboardings p
        where p.firm_connection_id = fc.id
        order by p.created_at desc
        limit 1
      ) po on true
      where fc.parent_workspace_id = p_workspace_id
        and fc.status = 'active'
        and fc.relationship_type = any(public.network_child_relationship_types(p_workspace_id))
        and fc.child_workspace_id is not null
        and po.status not in ('ready', 'rejected', 'withdrawn')
        and po.updated_at < now() - (p_inactivity_days || ' days')::interval
    ) as combined(connection_id, partner_name, relationship_type, population, current_status, last_activity_at)
    order by last_activity_at asc;
end;
$function$;

revoke all on function public.get_network_stalled_partners(uuid, integer) from public, anon;
grant execute on function public.get_network_stalled_partners(uuid, integer) to authenticated;
