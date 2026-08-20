-- 1. Delete the dormant filing-status sync trigger/function -- confirmed
--    it has never matched any real organizer_fields row (it looks for a
--    field labeled exactly "filing status", which has never existed on
--    any template in this system) and can no longer be made to work
--    correctly anyway, since marital status alone can't determine an
--    exact IRS filing status (Married could be MFJ or MFS).
drop trigger if exists trg_sync_filing_status_from_organizer on public.organizer_responses;
drop function if exists public.sync_filing_status_from_organizer();

-- 2. Real bug: a client portal user could never read organizer_templates
--    or organizer_fields for any workspace-scoped template (only the
--    global/preloaded ones with workspace_id null) -- both SELECT
--    policies only allowed staff (is_workspace_member) or a global row,
--    with no portal-user branch at all. Since every real template a firm
--    actually sends is copied into that firm's own workspace (never
--    stays workspace_id null), this silently broke the entire client-
--    facing organizer flow: the template name came back null (falling
--    back to the generic "Organizer" title) and organizer_fields came
--    back completely empty, with no error -- confirmed by simulating a
--    real client's exact RLS-scoped session.
create or replace function public.is_portal_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.client_portal_users
    where user_id = auth.uid() and status = 'active' and workspace_id = p_workspace_id
  );
$$;

revoke all on function public.is_portal_member(uuid) from public, anon;
grant execute on function public.is_portal_member(uuid) to authenticated;

alter policy organizer_templates_select on public.organizer_templates
using (
  workspace_id is null
  or is_workspace_member(workspace_id)
  or has_config_object_share_access('organizer_templates', id)
  or is_portal_member(workspace_id)
);

alter policy organizer_fields_select on public.organizer_fields
using (
  exists (
    select 1 from public.organizer_templates t
    where t.id = organizer_fields.organizer_template_id
      and (t.workspace_id is null or is_workspace_member(t.workspace_id) or is_portal_member(t.workspace_id))
  )
);
