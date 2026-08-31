-- Phase 7: mark_document_request_item_received() set status = 'received',
-- but document_request_item_statuses' CHECK constraint only allows
-- 'pending' | 'uploaded' | 'waived' -- so this RPC has always raised a
-- check-constraint violation and could never actually succeed, for any
-- workspace, ever. Never caught because document_request_templates had
-- zero rows anywhere until this same phase's builder-UI fix, so this
-- manual "staff confirms they received the document some other way"
-- action had never actually been exercised.
--
-- Fixed to set 'uploaded' -- the same status fulfill_document_request_item
-- uses for a client-portal upload, since both cases mean "we have this
-- document," which is exactly what check_document_request_completion's
-- pending-count check treats as fulfilling the requirement.

create or replace function public.mark_document_request_item_received(p_item_status_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  set status = 'uploaded', updated_at = now()
  where id = p_item_status_id;
end;
$function$;
