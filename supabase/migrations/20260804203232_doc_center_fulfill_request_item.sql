
create or replace function public.fulfill_document_request_item(p_item_status_id uuid, p_attachment_id uuid)
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
  set status = 'uploaded', fulfilled_by_attachment_id = p_attachment_id, updated_at = now()
  where id = p_item_status_id;
end;
$$;

revoke execute on function public.fulfill_document_request_item(uuid, uuid) from public, anon;

create or replace function public.check_document_request_completion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_incomplete_required int;
begin
  select count(*) into v_incomplete_required
  from public.document_request_item_statuses
  where document_request_id = new.document_request_id
    and is_required and status = 'pending';

  if v_incomplete_required = 0 then
    update public.document_requests set status = 'completed', updated_at = now()
    where id = new.document_request_id and status = 'open';
  end if;

  return new;
end;
$$;

create trigger trg_check_document_request_completion
  after update of status on public.document_request_item_statuses
  for each row execute function public.check_document_request_completion();

revoke execute on function public.check_document_request_completion() from public, anon, authenticated;
