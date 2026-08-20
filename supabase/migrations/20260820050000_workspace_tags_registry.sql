-- A real tag registry, replacing the "just scan clients.tags for whatever
-- strings happen to be in use" approach (get_workspace_tags). That approach
-- can only ever show tags that have already been applied to a client -- a
-- tag an automation is configured to look for but that's never actually
-- fired yet is invisible, which is exactly the blind spot that let today's
-- dangling-trigger bugs hide. This gives every tag a real row, a rename
-- that cascades everywhere it's used instead of silently forking into two
-- different strings, and a delete that's blocked (not silently broken)
-- while something still depends on it.

create table public.workspace_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

alter table public.workspace_tags enable row level security;

create policy workspace_tags_select on public.workspace_tags
  for select using (public.is_workspace_member(workspace_id));

-- Inserts/updates/deletes only ever happen through the functions below
-- (permission-checked there), not direct table access from the client.
create policy workspace_tags_no_direct_write on public.workspace_tags
  for all using (false) with check (false);

-- Backfill from every tag already in use, so the registry starts complete
-- rather than empty.
insert into public.workspace_tags (workspace_id, name)
select distinct c.workspace_id, t
from public.clients c, unnest(c.tags) as t
where t is not null and btrim(t) <> ''
on conflict (workspace_id, name) do nothing;

-- Also backfill every tag an automation already references but that no
-- client has been tagged with yet -- exactly the class this registry
-- exists to make visible.
insert into public.workspace_tags (workspace_id, name)
select distinct a.workspace_id, a.trigger_config->>'tag'
from public.automations a
where a.trigger_type = 'client.tag_added' and nullif(a.trigger_config->>'tag', '') is not null
on conflict (workspace_id, name) do nothing;

insert into public.workspace_tags (workspace_id, name)
select distinct a.workspace_id, s.action_config->>'tag'
from public.automation_steps s
join public.automations a on a.id = s.automation_id
where s.action_type in ('add_tag', 'remove_tag') and nullif(s.action_config->>'tag', '') is not null
on conflict (workspace_id, name) do nothing;

insert into public.workspace_tags (workspace_id, name)
select distinct a.workspace_id, cond->>'value'
from public.automation_step_edges e
join public.automations a on a.id = e.automation_id
cross join lateral jsonb_array_elements(coalesce(e.branch_conditions, '[]'::jsonb)) as cond
where cond->>'field' = 'client.tags' and nullif(cond->>'value', '') is not null
on conflict (workspace_id, name) do nothing;

-- Idempotent: returns the existing tag's id if it's already registered,
-- otherwise creates it. This is the one function every "new tag" moment in
-- the app calls through -- the Tags settings page's Add button, the client
-- Tags editor, and (once wired) any automation field that lets staff type
-- a tag that doesn't exist yet.
create or replace function public.create_workspace_tag(p_workspace_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name text := btrim(p_name);
  v_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to create a tag in this workspace';
  end if;
  if v_name = '' then
    raise exception 'Tag name cannot be empty';
  end if;

  select id into v_id from public.workspace_tags where workspace_id = p_workspace_id and name = v_name;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.workspace_tags (workspace_id, name, created_by)
  values (p_workspace_id, v_name, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_workspace_tag(uuid, text) from public, anon;
grant execute on function public.create_workspace_tag(uuid, text) to authenticated;

-- Renames a tag everywhere it's used: the registry row, every client
-- currently wearing it, every automation trigger/action/condition
-- referencing it by name. A rename that only touched the registry would
-- silently fork the tag into two different strings the moment it saved --
-- clients still carrying the old spelling that nothing matches anymore.
create or replace function public.rename_workspace_tag(p_workspace_id uuid, p_tag_id uuid, p_new_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_old_name text;
  v_new_name text := btrim(p_new_name);
begin
  if not public.has_permission(p_workspace_id, 'automations.manage') then
    raise exception 'insufficient permissions to rename a tag in this workspace';
  end if;
  if v_new_name = '' then
    raise exception 'Tag name cannot be empty';
  end if;

  select name into v_old_name from public.workspace_tags where id = p_tag_id and workspace_id = p_workspace_id;
  if v_old_name is null then
    raise exception 'Tag not found in this workspace';
  end if;
  if v_old_name = v_new_name then
    return;
  end if;
  if exists (select 1 from public.workspace_tags where workspace_id = p_workspace_id and name = v_new_name) then
    raise exception 'A tag named "%" already exists', v_new_name;
  end if;

  update public.workspace_tags set name = v_new_name, updated_at = now() where id = p_tag_id;

  update public.clients
  set tags = array_replace(tags, v_old_name, v_new_name)
  where workspace_id = p_workspace_id and v_old_name = any(tags);

  update public.automations
  set trigger_config = jsonb_set(trigger_config, '{tag}', to_jsonb(v_new_name))
  where workspace_id = p_workspace_id and trigger_type = 'client.tag_added' and trigger_config->>'tag' = v_old_name;

  update public.automation_steps s
  set action_config = jsonb_set(s.action_config, '{tag}', to_jsonb(v_new_name))
  from public.automations a
  where a.id = s.automation_id and a.workspace_id = p_workspace_id
    and s.action_type in ('add_tag', 'remove_tag') and s.action_config->>'tag' = v_old_name;

  update public.automation_step_edges e
  set branch_conditions = (
    select jsonb_agg(
      case
        when cond->>'field' = 'client.tags' and cond->>'value' = v_old_name
          then jsonb_set(cond, '{value}', to_jsonb(v_new_name))
        else cond
      end
    )
    from jsonb_array_elements(e.branch_conditions) as cond
  )
  from public.automations a
  where a.id = e.automation_id and a.workspace_id = p_workspace_id
    and e.branch_conditions is not null
    and exists (
      select 1 from jsonb_array_elements(e.branch_conditions) as c2
      where c2->>'field' = 'client.tags' and c2->>'value' = v_old_name
    );
end;
$$;

revoke all on function public.rename_workspace_tag(uuid, uuid, text) from public, anon;
grant execute on function public.rename_workspace_tag(uuid, uuid, text) to authenticated;

-- Deleting a tag still in use by an automation is refused rather than
-- silently stripped -- the same "dead trigger" failure mode this whole
-- registry exists to catch, just introduced from the other direction.
create or replace function public.delete_workspace_tag(p_workspace_id uuid, p_tag_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name text;
  v_automation_names text[];
begin
  if not public.has_permission(p_workspace_id, 'automations.manage') then
    raise exception 'insufficient permissions to delete a tag in this workspace';
  end if;

  select name into v_name from public.workspace_tags where id = p_tag_id and workspace_id = p_workspace_id;
  if v_name is null then
    raise exception 'Tag not found in this workspace';
  end if;

  select array_agg(distinct a.name) into v_automation_names
  from public.automations a
  where a.workspace_id = p_workspace_id
    and (
      (a.trigger_type = 'client.tag_added' and a.trigger_config->>'tag' = v_name)
      or exists (
        select 1 from public.automation_steps s
        where s.automation_id = a.id and s.action_type in ('add_tag', 'remove_tag') and s.action_config->>'tag' = v_name
      )
      or exists (
        select 1 from public.automation_step_edges e, jsonb_array_elements(coalesce(e.branch_conditions, '[]'::jsonb)) as cond
        where e.automation_id = a.id and cond->>'field' = 'client.tags' and cond->>'value' = v_name
      )
    );

  if v_automation_names is not null and array_length(v_automation_names, 1) > 0 then
    raise exception 'Still used by: %. Update those automations before deleting this tag.', array_to_string(v_automation_names, ', ');
  end if;

  update public.clients set tags = array_remove(tags, v_name) where workspace_id = p_workspace_id and v_name = any(tags);
  delete from public.workspace_tags where id = p_tag_id;
end;
$$;

revoke all on function public.delete_workspace_tag(uuid, uuid) from public, anon;
grant execute on function public.delete_workspace_tag(uuid, uuid) to authenticated;

-- Powers the Tags settings page: every registered tag plus how many
-- clients currently wear it and which automations reference it, computed
-- server-side rather than pulled apart client-side across three tables.
create or replace function public.list_workspace_tags_with_usage(p_workspace_id uuid)
returns table (id uuid, name text, client_count bigint, automation_names text[])
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace';
  end if;

  return query
  select
    wt.id,
    wt.name,
    coalesce((select count(*) from public.clients c where c.workspace_id = p_workspace_id and wt.name = any(c.tags)), 0),
    coalesce((
      select array_agg(distinct a.name)
      from public.automations a
      where a.workspace_id = p_workspace_id
        and (
          (a.trigger_type = 'client.tag_added' and a.trigger_config->>'tag' = wt.name)
          or exists (
            select 1 from public.automation_steps s
            where s.automation_id = a.id and s.action_type in ('add_tag', 'remove_tag') and s.action_config->>'tag' = wt.name
          )
          or exists (
            select 1 from public.automation_step_edges e, jsonb_array_elements(coalesce(e.branch_conditions, '[]'::jsonb)) as cond
            where e.automation_id = a.id and cond->>'field' = 'client.tags' and cond->>'value' = wt.name
          )
        )
    ), '{}'::text[])
  from public.workspace_tags wt
  where wt.workspace_id = p_workspace_id
  order by wt.name;
end;
$$;

revoke all on function public.list_workspace_tags_with_usage(uuid) from public, anon;
grant execute on function public.list_workspace_tags_with_usage(uuid) to authenticated;
