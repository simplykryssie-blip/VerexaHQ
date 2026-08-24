-- Replace the lost-lead-based retention criterion with the actual policy:
-- any portal invite not activated and confirmed within 30 days of being
-- sent gets deactivated, regardless of the client's lead/lost status.
-- accepted_at is the real "confirmed" marker (set when the invite is
-- accepted), so this only ever touches invites that were never completed.
create or replace function public.revoke_expired_portal_access()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  with expired as (
    select cpu.id, cpu.workspace_id, cpu.client_id, cpu.invited_at
    from public.client_portal_users cpu
    where cpu.status = 'invited'
      and cpu.accepted_at is null
      and cpu.invited_at <= now() - interval '30 days'
  ),
  revoked as (
    update public.client_portal_users cpu
    set status = 'revoked'
    from expired
    where cpu.id = expired.id
    returning cpu.id, cpu.workspace_id, cpu.client_id, expired.invited_at
  )
  insert into public.audit_log (workspace_id, entity_type, entity_id, action, severity, before_data, after_data, metadata)
  select workspace_id, 'client_portal_users', id, 'update', 'info',
    jsonb_build_object('status', 'invited'),
    jsonb_build_object('status', 'revoked'),
    jsonb_build_object('reason', 'Portal invite not activated within 30 days of being sent', 'client_id', client_id, 'invited_at', invited_at)
  from revoked;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.revoke_expired_portal_access() from public, anon, authenticated;
grant execute on function public.revoke_expired_portal_access() to public, anon, authenticated, service_role;
