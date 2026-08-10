-- Two gaps in the document-request flow, both from the same complaint: if
-- a client sends only part of what was asked for, staff had no way to (a)
-- mark an item received without forcing a file through the upload flow
-- (e.g. it arrived by mail/email/in person), and (b) avoid re-asking for
-- that same item when they send a follow-up request for what's still
-- missing -- create_document_request always built a brand-new all-pending
-- item set, with no memory of what this entity already turned in.

create or replace function public.mark_document_request_item_received(p_item_status_id uuid)
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
  set status = 'received', updated_at = now()
  where id = p_item_status_id;
end;
$$;

revoke all on function public.mark_document_request_item_received(uuid) from public, anon;
grant execute on function public.mark_document_request_item_received(uuid) to authenticated;

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
  insert into public.document_request_item_statuses (document_request_id, document_request_item_id, name, is_required, status, fulfilled_by_attachment_id)
  select
    v_request_id,
    dri.id,
    dri.name,
    dri.is_required,
    coalesce(prior.status, 'pending'),
    prior.fulfilled_by_attachment_id
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
