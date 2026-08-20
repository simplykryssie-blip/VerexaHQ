-- PTIN workspaces connected to an ERO (active ero_ptin firm_connections row) read the
-- ERO's branding row instead of their own, so the staff app can show the ERO's brand.
-- Additive SELECT policy -- the existing own-workspace branding_select policy is untouched.
create policy "branding_select_via_ero_connection" on public.branding
for select
using (
  exists (
    select 1
    from public.firm_connections fc
    where fc.parent_workspace_id = branding.workspace_id
      and fc.relationship_type = 'ero_ptin'
      and fc.status = 'active'
      and public.is_workspace_member(fc.child_workspace_id)
  )
);
