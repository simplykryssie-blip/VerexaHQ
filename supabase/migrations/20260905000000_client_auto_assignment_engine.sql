-- Platform-wide: the "account holder" a new client's Relationship Manager
-- field showed as a suggestion was purely cosmetic (see
-- app/(app)/clients/[id]/page.tsx's rmDefault) -- nothing ever actually
-- wrote it. This makes real assignment happen the moment a client enters
-- the CRM, for every workspace:
--   - a staff member adding their own client -> assigned to themselves
--   - the account owner adding a client -> defaults to themselves (still
--     overridable via an explicit relationship_manager_id at insert time,
--     e.g. NewClientButton's "assign to" picker)
--   - no specific staff member involved (public intake, portal signup,
--     imports, any automated path) -> the workspace's configured mode:
--     round-robin across a chosen staff pool, or always the account owner
--     (the default -- an independent PTIN account never needs to touch
--     this setting, every client just goes to them)

alter table public.workspaces
  add column client_assignment_mode text not null default 'owner'
    check (client_assignment_mode in ('owner', 'round_robin')),
  add column client_assignment_staff_pool uuid[] not null default '{}';

create or replace function public.resolve_client_relationship_manager(p_workspace_id uuid, p_creator_user_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_mode text;
  v_pool uuid[];
  v_owner_id uuid;
  v_resolved uuid;
  v_creator_is_active_staff boolean;
begin
  select client_assignment_mode, client_assignment_staff_pool into v_mode, v_pool
  from public.workspaces where id = p_workspace_id;

  select user_id into v_owner_id from public.workspace_users
  where workspace_id = p_workspace_id and is_owner = true and status = 'active'
  limit 1;

  -- A staff member (not the owner) creating a client on their own behalf
  -- becomes that client's relationship manager automatically -- their own
  -- client base, no pool logic involved.
  if p_creator_user_id is not null and p_creator_user_id is distinct from v_owner_id then
    select exists(
      select 1 from public.workspace_users
      where workspace_id = p_workspace_id and user_id = p_creator_user_id and status = 'active'
    ) into v_creator_is_active_staff;
    if v_creator_is_active_staff then
      return p_creator_user_id;
    end if;
  end if;

  -- Otherwise (the owner creating a client themself, or no creator at all
  -- -- an automated/public-source client) falls through to the workspace's
  -- configured assignment mode.
  if coalesce(v_mode, 'owner') = 'round_robin' and v_pool is not null and array_length(v_pool, 1) > 0 then
    select wu.user_id into v_resolved
    from public.workspace_users wu
    where wu.workspace_id = p_workspace_id and wu.status = 'active' and wu.user_id = any(v_pool)
    order by (
      select count(*) from public.clients c2
      where c2.relationship_manager_id = wu.user_id and c2.lifecycle_status not in ('archived', 'lost')
    ) asc, random()
    limit 1;
    if v_resolved is not null then
      return v_resolved;
    end if;
  end if;

  return v_owner_id;
end;
$function$;

revoke all on function public.resolve_client_relationship_manager(uuid, uuid) from public, anon, authenticated;

create or replace function public.auto_assign_client_relationship_manager()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if NEW.relationship_manager_id is null then
    NEW.relationship_manager_id := public.resolve_client_relationship_manager(NEW.workspace_id, auth.uid());
  end if;
  return NEW;
end;
$function$;

drop trigger if exists trg_auto_assign_client_relationship_manager on public.clients;
create trigger trg_auto_assign_client_relationship_manager
before insert on public.clients
for each row execute function public.auto_assign_client_relationship_manager();
