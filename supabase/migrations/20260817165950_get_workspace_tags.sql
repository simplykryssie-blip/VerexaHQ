-- clients.tags (text[]) and the whole tag-triggered automation system
-- (add_tag/remove_tag actions, client.tag_added trigger, client.tags
-- condition) already existed, but nothing in the app could actually put a
-- tag on a client -- the column only ever rendered read-only. This RPC
-- backs the tag-entry autocomplete so staff reuse an existing tag ("VIP",
-- "Referral") instead of accidentally forking it with a typo.
create or replace function public.get_workspace_tags(p_workspace_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace';
  end if;
  return coalesce(
    (select array_agg(distinct t order by t) from public.clients c, unnest(c.tags) as t where c.workspace_id = p_workspace_id),
    '{}'::text[]
  );
end;
$function$;
