
create or replace function public.apply_document_folder_template()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_template_id uuid;
  v_item record;
  v_id_map jsonb := '{}'::jsonb;
  v_new_folder_id uuid;
  v_parent_folder_id uuid;
begin
  if new.service_id is null then
    return new;
  end if;

  select document_folder_template_id into v_template_id from public.services where id = new.service_id;
  if v_template_id is null then
    return new;
  end if;

  for v_item in
    with recursive tree as (
      select id, parent_item_id, name, display_order, 0 as depth
      from public.document_folder_template_items
      where document_folder_template_id = v_template_id and parent_item_id is null
      union all
      select c.id, c.parent_item_id, c.name, c.display_order, t.depth + 1
      from public.document_folder_template_items c
      join tree t on c.parent_item_id = t.id
    )
    select * from tree order by depth, display_order
  loop
    v_parent_folder_id := case
      when v_item.parent_item_id is null then null
      else (v_id_map ->> v_item.parent_item_id::text)::uuid
    end;

    insert into public.document_folders (workspace_id, entity_type, entity_id, parent_folder_id, name, display_order, created_by)
    values (new.workspace_id, 'engagement', new.id, v_parent_folder_id, v_item.name, v_item.display_order, auth.uid())
    returning id into v_new_folder_id;

    v_id_map := v_id_map || jsonb_build_object(v_item.id::text, v_new_folder_id::text);
  end loop;

  return new;
end;
$$;

create trigger trg_apply_document_folder_template after insert on public.engagements
  for each row execute function public.apply_document_folder_template();

revoke execute on function public.apply_document_folder_template() from public, anon, authenticated;
