-- Staff-mediated in-person signing (client signs on a device staff hands
-- them, or staff records a signature obtained another way) had no way to
-- record that a staff member actually confirmed the signer's identity --
-- IRS Pub 1345 requires that confirmation for anything short of true
-- self-service portal/KBA signing. This adds a real, database-enforced
-- attestation step: a staff member must confirm presence + identity
-- before they can hand off a signing link or record a signature
-- themselves, and it's permanently recorded (who, when).

alter table public.signature_request_signers
  add column attested_by uuid references public.user_profiles(id),
  add column attested_at timestamptz;

create or replace function public.attest_signature_presence(p_signer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_workspace_id uuid;
begin
  select r.workspace_id into v_workspace_id
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  where s.id = p_signer_id;

  if v_workspace_id is null then
    raise exception 'signer not found';
  end if;

  if not public.has_permission(v_workspace_id, 'signatures.request') then
    raise exception 'insufficient permissions';
  end if;

  update public.signature_request_signers
  set attested_by = auth.uid(), attested_at = now()
  where id = p_signer_id;
end;
$function$;

-- Enforce it server-side too, not just in the UI -- a staff-authorized call
-- to record_signature (as opposed to the signer's own portal-authenticated
-- signature) now requires that attestation already be on file.
create or replace function public.record_signature(p_signer_id uuid, p_signature_type text, p_signature_image_path text DEFAULT NULL::text, p_typed_name text DEFAULT NULL::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_request_id uuid;
  v_workspace_id uuid;
  v_attachment_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_signer_email text;
  v_caller_email text;
  v_pending_count int;
  v_is_staff boolean;
begin
  if p_typed_name is null or btrim(p_typed_name) = '' then
    raise exception 'A typed signature is required';
  end if;
  if p_signature_type = 'drawn' and (p_signature_image_path is null or btrim(p_signature_image_path) = '') then
    raise exception 'A drawn signature is required';
  end if;

  select s.signature_request_id, r.workspace_id, r.attachment_id, a.entity_type, a.entity_id, s.signer_email
  into v_request_id, v_workspace_id, v_attachment_id, v_entity_type, v_entity_id, v_signer_email
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  join public.attachments a on a.id = r.attachment_id
  where s.id = p_signer_id;

  if v_request_id is null then
    raise exception 'signer not found';
  end if;

  select email into v_caller_email from auth.users where id = auth.uid();

  v_is_staff := public.has_permission(v_workspace_id, 'signatures.request');

  if not (
    v_is_staff
    or (
      v_signer_email is not null and lower(v_caller_email) = lower(v_signer_email)
      and public.is_portal_user_for_entity(v_entity_type, v_entity_id)
    )
  ) then
    raise exception 'insufficient permissions';
  end if;

  if v_is_staff and not exists (
    select 1 from public.signature_request_signers where id = p_signer_id and attested_by is not null
  ) then
    raise exception 'Please confirm you are present and have verified this signer''s identity before recording their signature.';
  end if;

  update public.signature_request_signers
  set status = 'signed', signature_type = p_signature_type, signature_image_path = p_signature_image_path,
      typed_name = btrim(p_typed_name), signed_at = now()
  where id = p_signer_id and status = 'pending';

  if not found then
    raise exception 'this signing request is no longer pending';
  end if;

  select count(*) into v_pending_count from public.signature_request_signers
  where signature_request_id = v_request_id and status = 'pending';

  if v_pending_count = 0 then
    update public.signature_requests set status = 'completed', updated_at = now() where id = v_request_id;
    update public.attachments set is_locked = true where id = v_attachment_id;
  end if;
end;
$function$;
