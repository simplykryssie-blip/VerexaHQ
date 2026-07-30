-- Third independent enforcement layer found by live-testing the actual
-- insert (not just reading the RPC): trg_enforce_client_write_permission
-- on public.clients called can_staff_write() directly, which still uses
-- the coarse workspace_allows_business_writes() (account_status='active'
-- only) gate. Same fix pattern as the previous two migrations: replace
-- with the fine-grained per-status permission (platform_account_status_
-- rules.allow_create_clients / allow_edit_clients) via the same
-- workspace_can_create_clients/workspace_can_edit_clients helpers already
-- used by save_workspace_client and the other clients-table trigger.
create or replace function public.enforce_client_write_permission()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_workspace_id uuid;
begin
  v_workspace_id:=coalesce(new.workspace_id,old.workspace_id);
  if tg_op = 'INSERT' then
    if not public.workspace_can_create_clients(v_workspace_id) then
      raise exception 'Client write permission required';
    end if;
  else
    if not public.workspace_can_edit_clients(v_workspace_id) then
      raise exception 'Client write permission required';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $function$;
