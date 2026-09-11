-- "Partners" area: lets an ERO see its connected PTINs' contact/business
-- info in one place, separate from the main Contacts tab (which is for
-- clients, not other firms), plus a place to store the ERO's own notes
-- about each partner.
--
-- Along the way this fixes a real bug in the existing Settings > Connections
-- page: it fetches the other side's workspace name via a plain embedded
-- select (`workspaces:child_workspace_id(name)` / `workspaces:parent_workspace_id(name)`),
-- which only works if the viewer happens to also be a member of that other
-- workspace (workspaces_select RLS is `is_workspace_member(id)`). That's
-- true for the demo accounts (same owner on both sides) but false for any
-- real ERO/PTIN pair, where it silently renders "Pending invite"/"your ERO"
-- for an active connection. Both directions now go through a narrow
-- SECURITY DEFINER read, same pattern as get_ero_return_status.

alter table public.firm_connections add column if not exists notes text;

create or replace function public.get_ero_connected_partners(p_workspace_id uuid)
returns table (
  connection_id uuid,
  child_workspace_id uuid,
  name text,
  status text,
  phone text,
  primary_contact_email text,
  website text,
  mailing_address text,
  billing_responsibility text,
  shares_communications_identity boolean,
  allows_branding_override boolean,
  notes text,
  created_at timestamptz,
  responded_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only a workspace admin can view connected partners';
  end if;

  return query
    select
      fc.id, fc.child_workspace_id, coalesce(cw.name, 'Pending invite'), fc.status,
      cw.phone, cw.primary_contact_email, cw.website, cw.mailing_address,
      fc.billing_responsibility, fc.shares_communications_identity, fc.allows_branding_override,
      fc.notes, fc.created_at, fc.responded_at
    from public.firm_connections fc
    left join public.workspaces cw on cw.id = fc.child_workspace_id
    where fc.parent_workspace_id = p_workspace_id
      and fc.relationship_type = 'ero_ptin'
    order by (fc.status = 'active') desc, cw.name nulls last;
end;
$function$;

revoke all on function public.get_ero_connected_partners(uuid) from public, anon;
grant execute on function public.get_ero_connected_partners(uuid) to authenticated;

create or replace function public.get_my_ero_connection(p_workspace_id uuid)
returns table (
  connection_id uuid,
  ero_workspace_id uuid,
  name text,
  phone text,
  primary_contact_email text,
  website text,
  billing_responsibility text,
  shares_communications_identity boolean,
  allows_branding_override boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Only a member of this workspace can view its ERO connection';
  end if;

  return query
    select
      fc.id, fc.parent_workspace_id, pw.name, pw.phone, pw.primary_contact_email, pw.website,
      fc.billing_responsibility, fc.shares_communications_identity, fc.allows_branding_override
    from public.firm_connections fc
    join public.workspaces pw on pw.id = fc.parent_workspace_id
    where fc.child_workspace_id = p_workspace_id
      and fc.relationship_type = 'ero_ptin'
      and fc.status = 'active'
    limit 1;
end;
$function$;

revoke all on function public.get_my_ero_connection(uuid) from public, anon;
grant execute on function public.get_my_ero_connection(uuid) to authenticated;

-- The update policy already scopes writes to the parent's own admin
-- (firm_connections_update: is_workspace_admin(parent_workspace_id)), so the
-- Partners page can write `notes` straight through supabase-js like the
-- existing comms/branding toggles in Settings > Connections already do --
-- no new write RPC needed.
