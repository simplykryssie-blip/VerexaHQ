-- Documents had no folder structure at all -- every client-scoped
-- document (organizer PDFs, signed engagement letters, manual uploads)
-- landed flat with folder_id null, and the workspace-wide Documents tab
-- never rendered a folder tree in the first place. This adds the
-- uniqueness guarantee resolveClientServiceFolder() (lib/documents/
-- resolveClientServiceFolder.ts) relies on to safely find-or-create a
-- per-client, per-service folder, then backfills every existing
-- client-scoped, unfoldered document into the right one.

-- A plain unique index on (workspace_id, entity_type, entity_id,
-- parent_folder_id, name) wouldn't actually enforce "one folder per
-- name at the top level" -- Postgres treats every NULL parent_folder_id
-- as distinct from every other, so top-level folders (which is all of
-- these) would never collide. Coalescing to a fixed sentinel normalizes
-- that.
create unique index if not exists document_folders_unique_per_entity_name
  on public.document_folders (workspace_id, entity_type, entity_id, coalesce(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

do $$
declare
  v_attachment record;
  v_service_name text;
  v_folder_id uuid;
begin
  for v_attachment in
    select a.id, a.workspace_id, a.entity_id
    from public.attachments a
    where a.entity_type = 'client' and a.folder_id is null
  loop
    select s.name into v_service_name
    from public.client_service_interests csi
    join public.services s on s.id = csi.service_id
    where csi.client_id = v_attachment.entity_id
    order by csi.created_at desc
    limit 1;

    if v_service_name is null then
      continue;
    end if;

    select id into v_folder_id
    from public.document_folders
    where workspace_id = v_attachment.workspace_id
      and entity_type = 'client'
      and entity_id = v_attachment.entity_id
      and parent_folder_id is null
      and name = v_service_name;

    if v_folder_id is null then
      insert into public.document_folders (workspace_id, entity_type, entity_id, parent_folder_id, name)
      values (v_attachment.workspace_id, 'client', v_attachment.entity_id, null, v_service_name)
      on conflict (workspace_id, entity_type, entity_id, coalesce(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid), name)
      do update set name = excluded.name
      returning id into v_folder_id;
    end if;

    update public.attachments set folder_id = v_folder_id where id = v_attachment.id;
  end loop;
end $$;
