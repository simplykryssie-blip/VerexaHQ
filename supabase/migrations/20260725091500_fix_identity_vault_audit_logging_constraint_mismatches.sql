-- Continuation of the previous migration in this series. After fixing
-- save_identity_vault_cipher's x.client_id column bug, a live regression
-- test of a real SSN save (as a real workspace admin) hit a second,
-- previously undetected failure: its insert into
-- sensitive_data_access_logs used access_type='write', but that column's
-- CHECK constraint only allows
-- ('view','reveal','download','export','print','copy','admin_access') —
-- there is no 'write' value in that table's vocabulary at all, because
-- sensitive_data_access_logs is clearly scoped to read/access events, not
-- writes. This insert had never once succeeded since the function was
-- written; save_identity_vault_cipher already writes a complete,
-- correctly-typed record of the same event to
-- client_identity_change_events (event_type 'created'/'replaced')
-- immediately above it, so the sensitive_data_access_logs insert was pure
-- redundant dead code that happened to always crash. Removed rather than
-- "fixed" — there's nothing this table's row would have added that
-- client_identity_change_events doesn't already capture correctly.
--
-- Tracing the equivalent reveal-side call (get_identity_vault_value ->
-- record_secure_data_audit_event) turned up a third, related failure:
-- record_secure_data_audit_event inserts into audit_logs with
-- action='secure_value_revealed' (or 'secure_value_saved'), but
-- audit_logs.action's CHECK constraint only allows
-- ('INSERT','UPDATE','DELETE') — a generic row-change-tracking vocabulary
-- that was never compatible with these domain-specific action strings.
-- record_secure_data_audit_event has therefore never completed a single
-- call either, for the same reason as the other two bugs: a hardcoded
-- literal/value that the target table's own schema doesn't accept. This
-- means every "reveal SSN" attempt in production has been failing too,
-- not just the save path this session started from.
--
-- record_secure_data_audit_event also hardcodes table_name to
-- 'custom_field_values' regardless of what's actually being audited,
-- which is wrong for identity-vault reveals specifically (a separate,
-- pre-existing mislabeling issue). Given it currently has zero working
-- callers after this migration, it is left as-is rather than patched
-- further here — see the completion report for a recommendation to
-- either fix or remove it in a follow-up, since guessing at every other
-- intended caller's needs is out of scope for this fix.
--
-- Fix: get_identity_vault_value now writes its reveal event directly to
-- client_identity_change_events (event_type='revealed') instead of
-- calling the broken record_secure_data_audit_event — the same
-- purpose-built, workspace/vault/client-scoped table
-- save_identity_vault_cipher already uses successfully for
-- created/replaced/verified/rejected events, with no CHECK constraint on
-- event_type to fight. This makes it the single consistent audit trail
-- for the whole identity vault lifecycle instead of splitting reveals
-- into a separately-broken generic table.
--
-- Also makes actor_user_id explicit on save_identity_vault_cipher's two
-- client_identity_change_events inserts. It wasn't actually broken —
-- that column already defaults to auth.uid() — but every other insert
-- into this table (including the new 'revealed' one below) sets it
-- explicitly, and leaving one pair implicit was more likely to bite
-- someone editing this later than to save real work now.

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
    insert into public.client_identity_change_events(workspace_id,vault_id,client_id,event_type,new_masked_value,reason,actor_user_id)
    values(p_workspace_id,v_id,p_client_id,'created',p_masked_value,p_reason,auth.uid());
  else
    update public.client_identity_vault set encrypted_payload=p_encrypted_payload,masked_value=p_masked_value,last_four=p_last_four,
      fingerprint=p_fingerprint,verification_status='unverified',verified_at=null,verified_by=null,updated_by=auth.uid(),updated_at=now()
    where id=v_id;
    insert into public.client_identity_change_events(workspace_id,vault_id,client_id,event_type,previous_masked_value,new_masked_value,reason,actor_user_id)
    values(p_workspace_id,v_id,p_client_id,'replaced',v_old,p_masked_value,p_reason,auth.uid());
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('client_id',x.id,'client_name',coalesce(x.account_name,x.business_name,concat_ws(' ',x.first_name,x.last_name)),'identity_type',i.identity_type)), '[]'::jsonb)
  into v_duplicate
  from public.client_identity_vault i join public.clients x on x.id=i.client_id
  where i.workspace_id=p_workspace_id and i.identity_type=p_identity_type and i.fingerprint=p_fingerprint and i.retired_at is null and i.client_id<>p_client_id;

  return jsonb_build_object('vault_id',v_id,'masked_value',p_masked_value,'duplicates',v_duplicate);
end $function$;

CREATE OR REPLACE FUNCTION public.get_identity_vault_value(p_workspace_id uuid, p_vault_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
declare
  v_record public.client_identity_vault;
  v_master_key text;
  v_plain text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.current_user_can_reveal_secure_client_data(p_workspace_id) then raise exception 'permission denied'; end if;
  if not public.current_user_secure_reveal_rate_ok(p_workspace_id) then raise exception 'rate limit reached'; end if;
  if length(trim(coalesce(p_reason,''))) < 5 then raise exception 'reason required'; end if;

  select * into v_record from public.client_identity_vault
  where id=p_vault_id and workspace_id=p_workspace_id and retired_at is null;
  if v_record.id is null then raise exception 'vault record not found'; end if;

  v_master_key := public._verexa_vault_secret('verexa_identity_vault_master_key');
  if v_master_key is null then raise exception 'identity vault key unavailable'; end if;
  v_plain := extensions.pgp_sym_decrypt(decode(v_record.encrypted_payload->>'ciphertext','base64'), v_master_key);

  insert into public.client_identity_change_events(workspace_id,vault_id,client_id,event_type,new_masked_value,reason,actor_user_id,metadata)
  values(p_workspace_id,v_record.id,v_record.client_id,'revealed',v_record.masked_value,p_reason,auth.uid(),jsonb_build_object('identity_type',v_record.identity_type));

  return jsonb_build_object('vault_id',v_record.id,'identity_type',v_record.identity_type,'value',v_plain,'masked_value',v_record.masked_value);
end $function$;
