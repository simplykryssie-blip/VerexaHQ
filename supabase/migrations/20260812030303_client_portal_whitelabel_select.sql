-- Lets a client portal user read their own firm's branding (or, if that firm
-- is ero_ptin-connected, the ERO's branding instead) so the client portal
-- can be white-labeled the same way the staff dashboard already is.
-- Portal users are never workspace_users (a deliberate boundary elsewhere in
-- this schema), so the existing is_workspace_member()-gated policies on
-- firm_connections/branding don't cover them -- these are additive.

create policy "firm_connections_select_portal_user" on public.firm_connections
for select
using (
  exists (
    select 1
    from public.client_portal_users cpu
    where cpu.user_id = auth.uid()
      and cpu.status = 'active'
      and cpu.workspace_id = firm_connections.child_workspace_id
  )
);

create policy "branding_select_portal_user" on public.branding
for select
using (
  exists (
    select 1
    from public.client_portal_users cpu
    where cpu.user_id = auth.uid()
      and cpu.status = 'active'
      and (
        cpu.workspace_id = branding.workspace_id
        or exists (
          select 1
          from public.firm_connections fc
          where fc.child_workspace_id = cpu.workspace_id
            and fc.parent_workspace_id = branding.workspace_id
            and fc.relationship_type = 'ero_ptin'
            and fc.status = 'active'
        )
      )
  )
);
