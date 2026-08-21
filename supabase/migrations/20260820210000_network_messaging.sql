-- Internal (staff-to-staff) messaging between an ERO/Service Bureau and its
-- connected PTINs, at the user's explicit request. Previously the "Messages"
-- nav tab just showed every message_threads/messages row for the workspace
-- regardless of entity_type, which meant client conversations leaked into a
-- tab meant to be internal-only, with no way to actually start a new
-- conversation there (message_threads/messages has no concept of an
-- internal, cross-workspace thread at all).
--
-- This is deliberately a separate table pair from message_threads/messages
-- rather than a new entity_type on those: those tables are single-workspace
-- (workspace_id + is_workspace_member(workspace_id) RLS), but a network
-- thread is inherently visible to TWO different workspaces at once, which
-- that model can't express.
--
-- Interaction shape (confirmed with the user): one-on-one threads only, both
-- for ERO/SB <-> connected PTIN and, when the ERO/SB turns it on, PTIN <->
-- PTIN within the same network -- never a shared group channel.

alter table public.workspaces add column if not exists allow_connected_ptin_messaging boolean not null default false;

create table if not exists public.network_message_threads (
  id uuid primary key default gen_random_uuid(),
  -- Which ERO/SB's network this thread belongs to -- always resolvable
  -- (either workspace_a/b IS the ERO/SB, or both are PTINs connected to the
  -- same one), stored explicitly so the peer-messaging permission toggle
  -- can be checked with a plain equality instead of re-deriving it via
  -- firm_connections on every read.
  ero_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  workspace_a_id uuid not null references public.workspaces(id) on delete cascade,
  workspace_b_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  constraint network_message_threads_distinct_workspaces check (workspace_a_id <> workspace_b_id)
);

-- One thread per pair per network, regardless of which side started it.
create unique index if not exists network_message_threads_unique_pair
  on public.network_message_threads (ero_workspace_id, least(workspace_a_id, workspace_b_id), greatest(workspace_a_id, workspace_b_id));

create index if not exists network_message_threads_workspace_a_idx on public.network_message_threads (workspace_a_id);
create index if not exists network_message_threads_workspace_b_idx on public.network_message_threads (workspace_b_id);

create table if not exists public.network_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.network_message_threads(id) on delete cascade,
  sender_workspace_id uuid not null references public.workspaces(id),
  sender_user_id uuid references auth.users(id),
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists network_messages_thread_id_idx on public.network_messages (thread_id);

alter table public.network_message_threads enable row level security;
alter table public.network_messages enable row level security;

-- Threads: readable by either side; no direct INSERT policy at all -- the
-- only way to create one is start_network_message_thread below (SECURITY
-- DEFINER, validates the pairing is actually allowed), so a naive raw
-- insert can never bypass the connection/permission rules.
create policy network_message_threads_select on public.network_message_threads
  for select using (public.is_workspace_member(workspace_a_id) or public.is_workspace_member(workspace_b_id));

-- Messages: readable by either side of the parent thread. INSERT is allowed
-- directly (no RPC needed) for replying into a thread that already exists
-- and passed its pairing check at creation time -- same shape as the
-- existing client-messaging pattern (MessagingHub.send()).
create policy network_messages_select on public.network_messages
  for select using (
    exists (
      select 1 from public.network_message_threads t
      where t.id = thread_id
        and (public.is_workspace_member(t.workspace_a_id) or public.is_workspace_member(t.workspace_b_id))
    )
  );

create policy network_messages_insert on public.network_messages
  for insert with check (
    sender_user_id = auth.uid()
    and public.is_workspace_member(sender_workspace_id)
    and exists (
      select 1 from public.network_message_threads t
      where t.id = thread_id
        and sender_workspace_id in (t.workspace_a_id, t.workspace_b_id)
    )
  );

-- Only read_at is ever updated client-side (marking a thread as read), same
-- as the existing messages table's convention.
create policy network_messages_update on public.network_messages
  for update using (
    exists (
      select 1 from public.network_message_threads t
      where t.id = thread_id
        and (public.is_workspace_member(t.workspace_a_id) or public.is_workspace_member(t.workspace_b_id))
    )
  );

-- Lists who p_workspace_id is allowed to message: every connected PTIN if
-- it's the ERO/SB itself; its own ERO/SB plus (only if that ERO/SB has
-- turned peer messaging on) every sibling PTIN connected to the same
-- ERO/SB, if it's a connected PTIN. SECURITY DEFINER because a PTIN has no
-- RLS visibility into other PTINs' firm_connections rows (by design --
-- this function is the one deliberate, narrow exception, and only ever
-- returns a name and id, nothing else about the sibling firm).
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

  select w.workspace_type into v_workspace_type from public.workspaces w where w.id = p_workspace_id;

  if v_workspace_type in ('ero_office', 'service_bureau') then
    return query
      select w.id, w.name, w.workspace_type
      from public.firm_connections fc
      join public.workspaces w on w.id = fc.child_workspace_id
      where fc.parent_workspace_id = p_workspace_id
        and fc.relationship_type = 'ero_ptin'
        and fc.status = 'active';
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
        and fc.child_workspace_id <> p_workspace_id;
  end if;
end;
$function$;

-- Whether the Messages nav item should even show for this workspace: an
-- ERO/SB itself, or a PTIN connected to one (regardless of whether peer
-- messaging is on -- they can always message their own ERO/SB).
create or replace function public.can_use_network_messaging(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.get_messageable_network_workspaces(p_workspace_id));
$function$;

-- Finds or creates the one thread for this pair within this network, then
-- posts the first message into it. Re-validates the pairing itself rather
-- than trusting the caller, so this stays safe even if called with an
-- arbitrary p_other_workspace_id.
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

-- Supabase's default privileges grant EXECUTE directly to anon and
-- authenticated on every new public-schema function -- that's a distinct
-- grant from PUBLIC, so revoking from PUBLIC alone (as done for
-- create_workspace earlier tonight) doesn't touch it. authenticated is
-- exactly who should be able to call these; anon (unauthenticated) is not,
-- so it's revoked explicitly even though every function here already
-- checks is_workspace_member(auth.uid()) internally and would reject an
-- anonymous caller anyway -- this closes the surface, not just relies on
-- the internal check.
revoke execute on function public.start_network_message_thread(uuid, uuid, text) from public, anon;
grant execute on function public.start_network_message_thread(uuid, uuid, text) to authenticated;
revoke execute on function public.get_messageable_network_workspaces(uuid) from public, anon;
grant execute on function public.get_messageable_network_workspaces(uuid) to authenticated;
revoke execute on function public.can_use_network_messaging(uuid) from public, anon;
grant execute on function public.can_use_network_messaging(uuid) to authenticated;
