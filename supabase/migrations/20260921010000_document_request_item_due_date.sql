-- Per-item due dates: a live document request's individual checklist items
-- (document_request_item_statuses) currently only inherit the whole
-- request's single due_date -- there's no way to flag, say, an ID upload as
-- due sooner than the rest of the checklist. Additive column, nullable, no
-- default meaning ("falls back to the request's own due date" is a display
-- concern, not a schema one).
alter table public.document_request_item_statuses add column due_date date;

create or replace function public.set_document_request_item_due_date(p_item_status_id uuid, p_due_date date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
begin
  select r.workspace_id into v_workspace_id
  from public.document_request_item_statuses s
  join public.document_requests r on r.id = s.document_request_id
  where s.id = p_item_status_id;

  if v_workspace_id is null then
    raise exception 'request item not found';
  end if;
  if not public.has_permission(v_workspace_id, 'documents.upload') then
    raise exception 'insufficient permissions';
  end if;

  update public.document_request_item_statuses
  set due_date = p_due_date, updated_at = now()
  where id = p_item_status_id;
end;
$$;

revoke all on function public.set_document_request_item_due_date(uuid, date) from public, anon;
grant execute on function public.set_document_request_item_due_date(uuid, date) to authenticated;

-- create_document_request never copied the template item's category onto
-- the request's own item_statuses row, even though item_statuses has had a
-- category column since the checklist-grouping UI shipped -- so every
-- template-created request rendered as one flat ungrouped list regardless
-- of how the checklist was categorized in the builder. The organizer-driven
-- checklist-sync path (sync-organizer-document-checklist) already copies
-- category correctly; this brings the template path in line with it.
create or replace function public.create_document_request(p_workspace_id uuid, p_entity_type text, p_entity_id uuid, p_template_id uuid, p_title text, p_due_date date DEFAULT NULL::date)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_request_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'documents.request') then
    raise exception 'insufficient permissions to request documents in this workspace';
  end if;

  insert into public.document_requests (workspace_id, entity_type, entity_id, document_request_template_id, title, due_date, created_by)
  values (p_workspace_id, p_entity_type, p_entity_id, p_template_id, p_title, p_due_date, auth.uid())
  returning id into v_request_id;

  -- Carry forward anything this entity already turned in for an item of
  -- the same name on an earlier request, so re-asking for what's still
  -- missing doesn't re-ask for what's already in hand.
  insert into public.document_request_item_statuses (document_request_id, document_request_item_id, name, is_required, status, fulfilled_by_attachment_id, category)
  select
    v_request_id,
    dri.id,
    dri.name,
    dri.is_required,
    coalesce(prior.status, 'pending'),
    prior.fulfilled_by_attachment_id,
    nullif(dri.category, '')
  from public.document_request_items dri
  left join lateral (
    select s.status, s.fulfilled_by_attachment_id
    from public.document_request_item_statuses s
    join public.document_requests r on r.id = s.document_request_id
    where r.entity_type = p_entity_type
      and r.entity_id = p_entity_id
      and s.name = dri.name
      and s.status <> 'pending'
    order by s.updated_at desc
    limit 1
  ) prior on true
  where dri.document_request_template_id = p_template_id;

  return v_request_id;
end;
$$;
