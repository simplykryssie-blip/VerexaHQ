-- record_signature already authenticates the caller (staff via
-- has_permission(workspace_id, 'signatures.request'), or the exact portal
-- user whose email matches a pending signer, per
-- is_portal_user_for_entity). SignaturesPanel's authenticated inline
-- signing needs to upload the drawn PNG to the "signatures" bucket before
-- calling that RPC, same as the two anonymous flows already do -- but
-- those go through a service-role API route since there's no session to
-- gate against. Here there IS a session, so real storage RLS insert
-- policies are the right tool instead of another service-role route.
--
-- signature_requests/signature_request_signers/attachments all have RLS
-- enabled with zero policies (access is exclusively through
-- SECURITY DEFINER RPCs), so a plain EXISTS(...) in the storage policy
-- would always see zero rows. This mirrors record_signature's portal
-- branch in its own SECURITY DEFINER helper so the policy can actually
-- see the row.
create or replace function public.is_pending_signer_for_signature_request(p_workspace_id uuid, p_signature_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_entity_type text;
  v_entity_id uuid;
  v_caller_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_caller_email = '' then
    return false;
  end if;

  select a.entity_type, a.entity_id
  into v_entity_type, v_entity_id
  from public.signature_requests r
  join public.attachments a on a.id = r.attachment_id
  where r.id = p_signature_request_id and r.workspace_id = p_workspace_id;

  if v_entity_type is null then
    return false;
  end if;

  return public.is_portal_user_for_entity(v_entity_type, v_entity_id)
    and exists (
      select 1 from public.signature_request_signers s
      where s.signature_request_id = p_signature_request_id
        and s.status = 'pending'
        and lower(s.signer_email) = v_caller_email
    );
end;
$function$;

revoke all on function public.is_pending_signer_for_signature_request(uuid, uuid) from public, anon;
grant execute on function public.is_pending_signer_for_signature_request(uuid, uuid) to authenticated;

-- Path shape (matches uploadSignatureImage): {workspace_id}/{signature_request_id}/{timestamp}-signature.png
create policy "signatures_staff_insert" on storage.objects
for insert
with check (
  bucket_id = 'signatures'
  and public.has_permission(((storage.foldername(name))[1])::uuid, 'signatures.request')
);

create policy "signatures_portal_insert" on storage.objects
for insert
with check (
  bucket_id = 'signatures'
  and public.is_pending_signer_for_signature_request(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid)
);
