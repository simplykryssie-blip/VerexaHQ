-- Phase 6D: Operational Readiness & Workspace Suspension Enforcement.
--
-- Two things, and only two things:
--
-- 1. A derived (never stored) "Operationally Active Partner" concept:
--    connection active AND current onboarding ready AND child workspace
--    active. No new column, no new status. Callers compute it fresh every
--    time from firm_connections/partner_onboardings/workspaces, exactly as
--    approved in the Phase 6D specification.
--
-- 2. The one real access-control gap the Phase 6D audit found: network
--    messaging, Learning Hub downline sharing, and the bank/software
--    catalog all authorize purely on firm_connections.status = 'active',
--    with no check that the workspace actually trying to use that access
--    isn't suspended/archived (workspaces.status, a wholly separate
--    concept from firm_connections.status). This migration closes that
--    gap at the exact points those three systems already authorize --
--    it does not add a new system, table, or status anywhere.

-- ---------------------------------------------------------------------------
-- Shared helper: the one place "is this workspace allowed to use network
-- access right now" is decided, so the three systems below (and anything
-- that needs the same rule later) share one definition instead of each
-- inlining workspaces.status = 'active'.
-- ---------------------------------------------------------------------------
create or replace function public.workspace_is_active(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((select w.status = 'active' from public.workspaces w where w.id = p_workspace_id), false);
$function$;

revoke all on function public.workspace_is_active(uuid) from public, anon;
grant execute on function public.workspace_is_active(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Derived Operationally Active Partner. Reads the *current* onboarding
-- record for the connection using the same "most recently created" rule
-- get_my_partner_onboarding already uses (order by created_at desc limit
-- 1) -- an older Ready record from a prior, since-rejected/withdrawn
-- onboarding attempt is never allowed to make a newer attempt look
-- operationally active.
-- ---------------------------------------------------------------------------
create or replace function public.is_operationally_active_partner(p_firm_connection_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_parent_workspace_id uuid;
  v_child_workspace_id uuid;
  v_connection_status text;
  v_workspace_status text;
  v_onboarding_status text;
begin
  select fc.parent_workspace_id, fc.child_workspace_id, fc.status
  into v_parent_workspace_id, v_child_workspace_id, v_connection_status
  from public.firm_connections fc
  where fc.id = p_firm_connection_id;

  if v_parent_workspace_id is null then
    raise exception 'connection not found';
  end if;

  if not (
    public.is_workspace_admin(v_parent_workspace_id)
    or (v_child_workspace_id is not null and public.is_workspace_member(v_child_workspace_id))
  ) then
    raise exception 'insufficient permissions to view operational status for this connection';
  end if;

  if v_connection_status is distinct from 'active' or v_child_workspace_id is null then
    return false;
  end if;

  select w.status into v_workspace_status from public.workspaces w where w.id = v_child_workspace_id;
  if v_workspace_status is distinct from 'active' then
    return false;
  end if;

  select po.status into v_onboarding_status
  from public.partner_onboardings po
  where po.firm_connection_id = p_firm_connection_id
  order by po.created_at desc
  limit 1;

  return coalesce(v_onboarding_status = 'ready', false);
end;
$function$;

revoke all on function public.is_operationally_active_partner(uuid) from public, anon;
grant execute on function public.is_operationally_active_partner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Network messaging: a suspended/archived workspace, on either side of a
-- relationship, can neither discover messageable peers nor read/send on an
-- already-existing thread. Parent/child administrative access to the
-- connection itself (firm_connections rows) is untouched -- this only
-- covers the messaging surface.
-- ---------------------------------------------------------------------------
create or replace function public.get_messageable_network_workspaces(p_workspace_id uuid)
returns table(workspace_id uuid, name text, workspace_type text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_type text;
  v_parent_id uuid;
  v_allow_peer boolean;
begin
  if not public.is_workspace_member(p_workspace_id) then
    return;
  end if;

  if not public.workspace_is_active(p_workspace_id) then
    return;
  end if;

  select w.workspace_type into v_workspace_type from public.workspaces w where w.id = p_workspace_id;

  if v_workspace_type in ('ero_office', 'service_bureau') then
    return query
      select w.id, w.name, w.workspace_type
      from public.firm_connections fc
      join public.workspaces w on w.id = fc.child_workspace_id
      where fc.parent_workspace_id = p_workspace_id
        and fc.relationship_type = 'ero_ptin'
        and fc.status = 'active'
        and public.workspace_is_active(w.id);
    return;
  end if;

  select fc.parent_workspace_id into v_parent_id
  from public.firm_connections fc
  where fc.child_workspace_id = p_workspace_id
    and fc.relationship_type = 'ero_ptin'
    and fc.status = 'active'
  limit 1;

  if v_parent_id is null then
    return;
  end if;

  if not public.workspace_is_active(v_parent_id) then
    return;
  end if;

  select w.id, w.name, w.workspace_type into workspace_id, name, workspace_type
  from public.workspaces w where w.id = v_parent_id;
  return next;

  select w.allow_connected_ptin_messaging into v_allow_peer from public.workspaces w where w.id = v_parent_id;
  if coalesce(v_allow_peer, false) then
    return query
      select w.id, w.name, w.workspace_type
      from public.firm_connections fc
      join public.workspaces w on w.id = fc.child_workspace_id
      where fc.parent_workspace_id = v_parent_id
        and fc.relationship_type = 'ero_ptin'
        and fc.status = 'active'
        and fc.child_workspace_id <> p_workspace_id
        and public.workspace_is_active(w.id);
  end if;
end;
$function$;

create or replace function public.can_use_network_messaging(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    case
      when not public.workspace_is_active(p_workspace_id) then false
      when (select w.workspace_type from public.workspaces w where w.id = p_workspace_id) in ('ero_office', 'service_bureau')
        then public.is_workspace_member(p_workspace_id)
      else exists (select 1 from public.get_messageable_network_workspaces(p_workspace_id))
    end;
$function$;

create or replace function public.start_network_message_thread(p_workspace_id uuid, p_other_workspace_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ero_workspace_id uuid;
  v_thread_id uuid;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace';
  end if;
  if not public.workspace_is_active(p_workspace_id) then
    raise exception 'this workspace is suspended and cannot use network messaging';
  end if;
  if nullif(btrim(p_body), '') is null then
    raise exception 'message body is required';
  end if;

  if not exists (
    select 1 from public.get_messageable_network_workspaces(p_workspace_id) m
    where m.workspace_id = p_other_workspace_id
  ) then
    raise exception 'this workspace is not reachable for network messaging';
  end if;

  select case when w.workspace_type in ('ero_office', 'service_bureau') then p_workspace_id else p_other_workspace_id end
  into v_ero_workspace_id
  from public.workspaces w where w.id = p_workspace_id;

  select id into v_thread_id
  from public.network_message_threads
  where ero_workspace_id = v_ero_workspace_id
    and least(workspace_a_id, workspace_b_id) = least(p_workspace_id, p_other_workspace_id)
    and greatest(workspace_a_id, workspace_b_id) = greatest(p_workspace_id, p_other_workspace_id);

  if v_thread_id is null then
    insert into public.network_message_threads (ero_workspace_id, workspace_a_id, workspace_b_id, created_by)
    values (v_ero_workspace_id, p_workspace_id, p_other_workspace_id, auth.uid())
    returning id into v_thread_id;
  end if;

  insert into public.network_messages (thread_id, sender_workspace_id, sender_user_id, body)
  values (v_thread_id, p_workspace_id, auth.uid(), p_body);

  update public.network_message_threads set last_message_at = now() where id = v_thread_id;

  return v_thread_id;
end;
$function$;

drop policy if exists network_message_threads_select on public.network_message_threads;
create policy network_message_threads_select on public.network_message_threads
  for select using (
    (public.is_workspace_member(workspace_a_id) and public.workspace_is_active(workspace_a_id))
    or (public.is_workspace_member(workspace_b_id) and public.workspace_is_active(workspace_b_id))
  );

drop policy if exists network_messages_select on public.network_messages;
create policy network_messages_select on public.network_messages
  for select using (
    exists (
      select 1 from public.network_message_threads t
      where t.id = thread_id
        and (
          (public.is_workspace_member(t.workspace_a_id) and public.workspace_is_active(t.workspace_a_id))
          or (public.is_workspace_member(t.workspace_b_id) and public.workspace_is_active(t.workspace_b_id))
        )
    )
  );

drop policy if exists network_messages_insert on public.network_messages;
create policy network_messages_insert on public.network_messages
  for insert with check (
    sender_user_id = auth.uid()
    and public.is_workspace_member(sender_workspace_id)
    and public.workspace_is_active(sender_workspace_id)
    and exists (
      select 1 from public.network_message_threads t
      where t.id = thread_id
        and sender_workspace_id in (t.workspace_a_id, t.workspace_b_id)
    )
  );

drop policy if exists network_messages_update on public.network_messages;
create policy network_messages_update on public.network_messages
  for update using (
    exists (
      select 1 from public.network_message_threads t
      where t.id = thread_id
        and (
          (public.is_workspace_member(t.workspace_a_id) and public.workspace_is_active(t.workspace_a_id))
          or (public.is_workspace_member(t.workspace_b_id) and public.workspace_is_active(t.workspace_b_id))
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Learning Hub: a suspended/archived downline workspace no longer appears
-- in "who can reach this owner's content" -- both has_learning_hub_access
-- (checked against the caller) and assign_learning_course (checked against
-- the assignee) read this same function, so both close together
-- automatically, with no separate edit to either.
-- ---------------------------------------------------------------------------
create or replace function public.learning_hub_reachable_workspaces(p_owner_workspace_id uuid)
returns table(workspace_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p_owner_workspace_id
  union
  select fc.child_workspace_id
  from public.firm_connections fc
  where fc.parent_workspace_id = p_owner_workspace_id
    and fc.status = 'active'
    and fc.child_workspace_id is not null
    and public.workspace_is_active(fc.child_workspace_id)
  union
  select ero_ptin.child_workspace_id
  from public.firm_connections sb_ero
  join public.firm_connections ero_ptin
    on ero_ptin.parent_workspace_id = sb_ero.child_workspace_id
   and ero_ptin.relationship_type = 'ero_ptin'
   and ero_ptin.status = 'active'
  where sb_ero.parent_workspace_id = p_owner_workspace_id
    and sb_ero.relationship_type = 'service_bureau_ero'
    and sb_ero.status = 'active'
    and sb_ero.allows_learning_hub_downline_share = true
    and public.workspace_is_active(ero_ptin.child_workspace_id);
$function$;

-- ---------------------------------------------------------------------------
-- Bank & Software catalogs: a connected child workspace can browse its
-- parent's catalog only while its own workspace is active. The owner's
-- direct access to its own catalog (is_workspace_member(workspace_id)) is
-- unrelated to network access and is left untouched.
-- ---------------------------------------------------------------------------
drop policy if exists bank_partners_select on public.bank_partners;
create policy bank_partners_select on public.bank_partners for select using (
  public.is_workspace_member(workspace_id)
  or exists (
    select 1 from public.firm_connections fc
    where fc.parent_workspace_id = bank_partners.workspace_id
      and fc.status = 'active'
      and public.is_workspace_member(fc.child_workspace_id)
      and public.workspace_is_active(fc.child_workspace_id)
  )
);

drop policy if exists software_partners_select on public.software_partners;
create policy software_partners_select on public.software_partners for select using (
  public.is_workspace_member(workspace_id)
  or exists (
    select 1 from public.firm_connections fc
    where fc.parent_workspace_id = software_partners.workspace_id
      and fc.status = 'active'
      and public.is_workspace_member(fc.child_workspace_id)
      and public.workspace_is_active(fc.child_workspace_id)
  )
);
