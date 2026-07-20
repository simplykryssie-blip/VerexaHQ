-- get_identity_vault_value logged reveals with action='reveal', but
-- record_secure_data_audit_event only accepts 'secure_value_saved' or
-- 'secure_value_revealed' — every reveal call raised "Invalid secure audit
-- action" before ever returning the decrypted value. Fixes the action string;
-- no other logic changed.
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

  perform public.record_secure_data_audit_event(p_workspace_id,v_record.id,'secure_value_revealed',jsonb_build_object('client_id',v_record.client_id,'identity_type',v_record.identity_type,'reason',p_reason,'masked_value',v_record.masked_value));

  return jsonb_build_object('vault_id',v_record.id,'identity_type',v_record.identity_type,'value',v_plain,'masked_value',v_record.masked_value);
end $function$
