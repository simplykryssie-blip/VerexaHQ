-- Internal, same-workspace staff-to-staff direct messages. Distinct from
-- network_message_threads/network_messages (cross-workspace, ERO<->PTIN)
-- and from message_threads/messages (client/portal conversations) -- this
-- is plain team chat between two members of the same firm, which the
-- messaging feature never actually supported despite "Messages" implying
-- it: an ERO owner and their own staff (e.g. a PTIN Preparer added
-- directly to the firm's workspace, not a separately connected PTIN firm)
-- had no way to message each other at all.

create table if not exists public.internal_message_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_a_id uuid not null references auth.users(id) on delete cascade,
  user_b_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  constraint internal_message_threads_distinct_users check (user_a_id <> user_b_id)
);

create unique index if not exists internal_message_threads_pair_idx
  on public.internal_message_threads (workspace_id, least(user_a_id, user_b_id), greatest(user_a_id, user_b_id));

create index if not exists internal_message_threads_workspace_idx on public.internal_message_threads (workspace_id);

create table if not exists public.internal_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.internal_message_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists internal_messages_thread_idx on public.internal_messages (thread_id);

alter table public.internal_message_threads enable row level security;
alter table public.internal_messages enable row level security;

create policy internal_message_threads_select on public.internal_message_threads
  for select using (
    public.is_workspace_member(workspace_id) and auth.uid() in (user_a_id, user_b_id)
  );

-- No direct insert policy -- threads are only created via
-- start_internal_message_thread, which validates both participants are
-- active members of the same workspace before creating one.

create policy internal_messages_select on public.internal_messages
  for select using (
    exists (
      select 1 from public.internal_message_threads t
      where t.id = internal_messages.thread_id
        and public.is_workspace_member(t.workspace_id)
        and auth.uid() in (t.user_a_id, t.user_b_id)
    )
  );

create policy internal_messages_insert on public.internal_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.internal_message_threads t
      where t.id = internal_messages.thread_id
        and public.is_workspace_member(t.workspace_id)
        and auth.uid() in (t.user_a_id, t.user_b_id)
    )
  );

create policy internal_messages_update on public.internal_messages
  for update using (
    exists (
      select 1 from public.internal_message_threads t
      where t.id = internal_messages.thread_id
        and public.is_workspace_member(t.workspace_id)
        and auth.uid() in (t.user_a_id, t.user_b_id)
    )
  )
  with check (
    exists (
      select 1 from public.internal_message_threads t
      where t.id = internal_messages.thread_id
        and public.is_workspace_member(t.workspace_id)
        and auth.uid() in (t.user_a_id, t.user_b_id)
    )
  );

create or replace function public.start_internal_message_thread(p_workspace_id uuid, p_other_user_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_thread_id uuid;
  v_a uuid := least(auth.uid(), p_other_user_id);
  v_b uuid := greatest(auth.uid(), p_other_user_id);
begin
  if auth.uid() = p_other_user_id then
    raise exception 'Cannot start a conversation with yourself';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Not a member of this workspace';
  end if;
  if not exists (
    select 1 from public.workspace_users wu
    where wu.workspace_id = p_workspace_id and wu.user_id = p_other_user_id and wu.status = 'active'
  ) then
    raise exception 'That person is not an active member of this workspace';
  end if;

  select id into v_thread_id
  from public.internal_message_threads
  where workspace_id = p_workspace_id and user_a_id = v_a and user_b_id = v_b;

  if v_thread_id is null then
    insert into public.internal_message_threads (workspace_id, user_a_id, user_b_id, created_by, last_message_at)
    values (p_workspace_id, v_a, v_b, auth.uid(), now())
    returning id into v_thread_id;
  else
    update public.internal_message_threads set last_message_at = now() where id = v_thread_id;
  end if;

  insert into public.internal_messages (thread_id, sender_id, body)
  values (v_thread_id, auth.uid(), p_body);

  return v_thread_id;
end;
$function$;

revoke all on function public.start_internal_message_thread(uuid, uuid, text) from public, anon;
grant execute on function public.start_internal_message_thread(uuid, uuid, text) to authenticated;
