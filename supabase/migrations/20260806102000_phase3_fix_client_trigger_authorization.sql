-- The RPC-level fix in the prior migration (save_workspace_client now
-- consults platform_account_status_rules via workspace_can_create_clients/
-- workspace_can_edit_clients) was masked by a SECOND, independent
-- enforcement layer: enforce_workspace_business_write_status_trigger,
-- attached to clients/documents/invoices/notes/tasks, which still called
-- the coarse workspace_allows_business_writes() (account_status='active'
-- only). Live-testing the actual insert as the blocked workspace's Owner
-- confirmed the trigger fires this same class of error independently of
-- the RPC's own check, which is why the P0001 persisted.
--
-- This only special-cases the 'clients' table (the table this bug report
-- and fix are scoped to) to consult the same fine-grained per-status rule
-- (platform_account_status_rules.allow_create_clients / allow_edit_
-- clients) as the RPC layer. documents/invoices/notes/tasks keep the
-- exact same coarse account_status='active' behavior as before -- changing
-- their write policy was not requested and is out of scope here.
create or replace function public.enforce_workspace_business_write_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid:=case when tg_op='DELETE' then old.workspace_id else new.workspace_id end;
begin
  if auth.role()='service_role' or public.is_platform_admin() then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if tg_table_name = 'clients' then
    if tg_op = 'INSERT' then
      if not public.workspace_can_create_clients(v_workspace_id) then
        raise exception 'Workspace is not active for business-data changes. Read-only, suspended, archived, and blocked workspaces may only view or export existing data.';
      end if;
    else
      if not public.workspace_can_edit_clients(v_workspace_id) then
        raise exception 'Workspace is not active for business-data changes. Read-only, suspended, archived, and blocked workspaces may only view or export existing data.';
      end if;
    end if;
    return case when tg_op='DELETE' then old else new end;
  end if;

  if not public.workspace_allows_business_writes(v_workspace_id) then
    raise exception 'Workspace is not active for business-data changes. Read-only, suspended, archived, and blocked workspaces may only view or export existing data.';
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$function$;
