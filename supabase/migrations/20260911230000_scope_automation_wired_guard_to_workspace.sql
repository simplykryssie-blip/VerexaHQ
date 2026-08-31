-- guard_delete_if_wired_to_automation compared trigger_config/action_config
-- values against ALL workspaces' automations, not just the row's own --
-- so deleting a template in one workspace could be falsely blocked by an
-- unrelated automation in a DIFFERENT workspace that happens to reference
-- the same slug (a real collision once workspace configs get cloned from
-- each other, since cloning intentionally preserves slugs). Scopes the
-- check to the same workspace as the row being deleted.
create or replace function public.guard_delete_if_wired_to_automation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key text := TG_ARGV[0];
  v_compare_slug boolean := TG_ARGV[1] = 'slug';
  v_value text;
  v_names text;
begin
  if v_compare_slug then
    v_value := old.slug;
  else
    v_value := old.id::text;
  end if;

  select string_agg(distinct a.name, ', ')
    into v_names
  from automations a
  left join automation_steps s on s.automation_id = a.id
  where a.workspace_id = old.workspace_id
    and ((a.trigger_config ->> v_key) = v_value or (s.action_config ->> v_key) = v_value);

  if v_names is not null then
    raise exception 'this is still wired into automation(s): %. update or remove those steps first', v_names;
  end if;

  return old;
end;
$function$;
