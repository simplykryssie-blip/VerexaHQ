-- Correction pass, accidental logic change A: 20261030010000_operational_gate_rpc_closure.sql's
-- create_document_request fix (adding the operational gate) also silently
-- dropped nullif(dri.category, '') -- a normalization present on current
-- main (20260921010000_document_request_item_due_date.sql) that turns an
-- empty-string category into a real null. Restoring it exactly, with no
-- other changes (the operational gate the branch correctly added stays).
CREATE OR REPLACE FUNCTION public.create_document_request(p_workspace_id uuid, p_entity_type text, p_entity_id uuid, p_template_id uuid, p_title text, p_due_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'documents.request') then
    raise exception 'insufficient permissions to request documents in this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  insert into public.document_requests (workspace_id, entity_type, entity_id, document_request_template_id, title, due_date, created_by)
  values (p_workspace_id, p_entity_type, p_entity_id, p_template_id, p_title, p_due_date, auth.uid())
  returning id into v_request_id;

  insert into public.document_request_item_statuses (document_request_id, document_request_item_id, name, is_required, category, status, fulfilled_by_attachment_id)
  select
    v_request_id,
    dri.id,
    dri.name,
    dri.is_required,
    nullif(dri.category, ''),
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
$function$
;
