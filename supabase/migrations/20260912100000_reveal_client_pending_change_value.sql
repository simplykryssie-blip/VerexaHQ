-- Review Queue only ever showed the proposed SSN's last 4 digits
-- (client_pending_changes.new_value_last4) -- if a client changes the
-- FIRST digits and keeps the same last 4, staff had no way to see that a
-- real change happened at all, let alone verify it looks legitimate.
-- new_value holds the real encrypted proposed value; this decrypts it on
-- demand, mirroring reveal_client_ssn's permission + audit pattern exactly.

create or replace function public.reveal_client_pending_change_value(p_pending_change_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row record;
  v_value text;
begin
  select id, workspace_id, client_id, target_column, new_value into v_row
  from public.client_pending_changes where id = p_pending_change_id;

  if v_row.id is null then
    raise exception 'pending change not found';
  end if;
  if v_row.target_column <> 'ssn' then
    raise exception 'this field cannot be revealed';
  end if;
  if not public.has_permission(v_row.workspace_id, 'identity.ssn_reveal') then
    raise exception 'insufficient permissions to reveal this value';
  end if;

  v_value := public.decrypt_client_secret(decode(v_row.new_value, 'base64'));

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (v_row.workspace_id, auth.uid(), 'clients', v_row.client_id, 'reveal_pending_ssn_change', 'warning');

  return v_value;
end;
$function$;

revoke all on function public.reveal_client_pending_change_value(uuid) from public, anon;
grant execute on function public.reveal_client_pending_change_value(uuid) to authenticated;
