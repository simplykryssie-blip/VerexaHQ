-- save_identity_vault_cipher's cross-client duplicate-fingerprint lookup
-- aliases public.clients as x, then builds
-- jsonb_build_object('client_id', x.client_id, ...) — but clients' primary
-- key column is id, not client_id (clients has no client_id column at
-- all). Every call raised "column x.client_id does not exist" (42703)
-- immediately after the encrypted vault row and its change-event log row
-- were already written, so the whole SECURITY DEFINER function rolled
-- back on every single invocation, for every identity type (ssn/ein/itin).
-- Since save_identity_vault_value has no exception handling around this
-- call, and ClientModal requires an SSN/EIN to create any client, this
-- blocked every new client creation that reached this step. Verified
-- live before this fix: a real test save rolled back with zero rows
-- written to client_identity_vault.
--
-- The join itself (`join public.clients x on x.id = i.client_id`) was
-- already correct — only the SELECT list's column reference was wrong.
-- Fixed to x.id, matching the working sibling function
-- check_identity_vault_duplicates, which builds the identical object
-- correctly (jsonb_build_object('client_id', c.id, ...)) and was
-- unaffected by this bug.
--
-- Cross-client SSN/EIN matches remain informational (returned as
-- `duplicates` in the result, not rejected) rather than a hard block —
-- this matches the app's one other duplicate-detection subsystem
-- (detect_client_duplicates / client_duplicate_warnings /
-- record_client_duplicate_acknowledgement), which warns staff and lets
-- them acknowledge and proceed rather than hard-blocking. Introducing a
-- hard rejection here only, inconsistent with that established pattern,
-- would also block legitimate cases this schema already exists to
-- support (correcting a client's SSN, or two client records that
-- legitimately share an EIN). The frontend does not yet surface this
-- `duplicates` field to staff; that's a follow-up UI change, not a
-- schema change, and is called out separately.
--
-- Same-signature CREATE OR REPLACE — this is a true in-place replace,
-- preserving the function's existing grants (service_role/postgres only;
-- callable indirectly via save_identity_vault_value, not directly by
-- authenticated end users).

CREATE OR REPLACE FUNCTION public.save_identity_vault_cipher(p_workspace_id uuid, p_client_id uuid, p_related_contact_id uuid, p_identity_type text, p_encrypted_payload jsonb, p_masked_value text, p_last_four text, p_fingerprint text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_id uuid; v_old text; v_duplicate jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.current_user_can_manage_secure_client_data(p_workspace_id) then raise exception 'permission denied'; end if;
  if not exists(select 1 from public.clients c where c.id=p_client_id and c.workspace_id=p_workspace_id) then raise exception 'client not found'; end if;
  if p_identity_type not in ('ssn','ein','itin','driver_license','other') then raise exception 'invalid identity type'; end if;
  if coalesce(length(p_fingerprint),0) < 32 then raise exception 'invalid fingerprint'; end if;

  select id, masked_value into v_id,v_old from public.client_identity_vault
  where workspace_id=p_workspace_id and client_id=p_client_id
    and coalesce(related_contact_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(p_related_contact_id,'00000000-0000-0000-0000-000000000000'::uuid)
    and identity_type=p_identity_type and retired_at is null
  for update;

  if v_id is null then
    insert into public.client_identity_vault(workspace_id,client_id,related_contact_id,identity_type,encrypted_payload,masked_value,last_four,fingerprint)
    values(p_workspace_id,p_client_id,p_related_contact_id,p_identity_type,p_encrypted_payload,p_masked_value,p_last_four,p_fingerprint)
    returning id into v_id;
    insert into public.client_identity_change_events(workspace_id,vault_id,client_id,event_type,new_masked_value,reason)
    values(p_workspace_id,v_id,p_client_id,'created',p_masked_value,p_reason);
  else
    update public.client_identity_vault set encrypted_payload=p_encrypted_payload,masked_value=p_masked_value,last_four=p_last_four,
      fingerprint=p_fingerprint,verification_status='unverified',verified_at=null,verified_by=null,updated_by=auth.uid(),updated_at=now()
    where id=v_id;
    insert into public.client_identity_change_events(workspace_id,vault_id,client_id,event_type,previous_masked_value,new_masked_value,reason)
    values(p_workspace_id,v_id,p_client_id,'replaced',v_old,p_masked_value,p_reason);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('client_id',x.id,'client_name',coalesce(x.account_name,x.business_name,concat_ws(' ',x.first_name,x.last_name)),'identity_type',i.identity_type)), '[]'::jsonb)
  into v_duplicate
  from public.client_identity_vault i join public.clients x on x.id=i.client_id
  where i.workspace_id=p_workspace_id and i.identity_type=p_identity_type and i.fingerprint=p_fingerprint and i.retired_at is null and i.client_id<>p_client_id;

  insert into public.sensitive_data_access_logs(workspace_id,accessed_by,access_type,data_category,target_table,target_id,client_id,reason,metadata)
  values(p_workspace_id,auth.uid(),'write',p_identity_type,'client_identity_vault',v_id,p_client_id,p_reason,jsonb_build_object('masked',p_masked_value));

  return jsonb_build_object('vault_id',v_id,'masked_value',p_masked_value,'duplicates',v_duplicate);
end $function$;
