-- Contacts Pass 2: a Contact must have exactly ONE primary address total,
-- not one primary per address_type. set_client_address_primary previously
-- only unset other primaries sharing the same address_type as the one
-- being set, so a client could end up with e.g. a primary "mailing"
-- address and a separate primary "business" address simultaneously.
--
-- Verified against production immediately before writing this migration:
-- zero existing clients currently have more than one primary address
-- across address_types, so this is a pure behavior change with no
-- conflicting rows to reconcile -- no backfill/cleanup needed.
create or replace function public.set_client_address_primary(p_address_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_client_id uuid;
  v_workspace_id uuid;
begin
  select client_id, workspace_id into v_client_id, v_workspace_id from public.client_addresses where id = p_address_id;
  if v_client_id is null then
    raise exception 'address not found';
  end if;
  if not has_permission(v_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.client_addresses set is_primary = false where client_id = v_client_id and is_primary and id <> p_address_id;
  update public.client_addresses set is_primary = true where id = p_address_id;
end;
$$;

-- Belt-and-suspenders: enforce the one-primary-per-client invariant at the
-- database level too, not just inside the RPC above. Safe to add now that
-- production has zero conflicting rows (verified above).
create unique index if not exists client_addresses_one_primary_per_client
  on public.client_addresses (client_id)
  where is_primary;
