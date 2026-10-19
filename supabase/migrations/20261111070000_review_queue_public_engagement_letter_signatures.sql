-- The Review Queue's "Documents submitted" section only ever queried
-- document_requests -- a signed public engagement letter
-- (engagement_letter_public_signatures, from the /e/[token] flow) has no
-- reviewed state at all and was never surfaced here. It already auto-files
-- itself into the client's Documents tab (see
-- app/api/documents/file-signed-engagement-letter/route.ts), so staff can
-- find it if they know to look, but nothing ever points them at it the way
-- a completed document request does.
--
-- Adds reviewed_at/reviewed_by, mirroring document_requests, plus a
-- mark_engagement_letter_signature_reviewed RPC mirroring
-- mark_document_request_reviewed (same documents.view permission gate).
alter table public.engagement_letter_public_signatures
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id);

CREATE OR REPLACE FUNCTION public.mark_engagement_letter_signature_reviewed(p_signature_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.engagement_letter_public_signatures where id = p_signature_id;
  if v_workspace_id is null then
    raise exception 'signature not found';
  end if;
  if not public.has_permission(v_workspace_id, 'documents.view') then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.engagement_letter_public_signatures
  set reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_signature_id;
end;
$function$;
