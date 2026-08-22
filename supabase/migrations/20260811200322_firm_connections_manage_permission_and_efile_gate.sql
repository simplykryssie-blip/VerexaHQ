-- Seeds the firm_connections.manage permission (invite generation/revocation
-- UI gating) onto the two system roles that already hold every other
-- workspace-management permission. Also adds the DB-enforced "ready for
-- e-file" gate: an ERO-connected PTIN's engagement can't be marked Ready To
-- Release unless the corresponding engagement_shares row is approved.
-- Enforced as a trigger (not just client-side) so it can't be bypassed by
-- any UI path.

insert into public.permissions (key, category, description)
values ('firm_connections.manage', 'workspace', 'Invite, manage, and disconnect connected PTIN firms (ERO only)')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'firm_connections.manage'
where r.slug in ('owner', 'admin') and r.workspace_id is null
on conflict do nothing;

create or replace function public.enforce_ero_efile_gate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_has_connection boolean;
  v_has_approved_share boolean;
begin
  if new.status = 'Ready To Release' and old.status is distinct from new.status then
    select exists (
      select 1 from public.firm_connections
      where child_workspace_id = new.workspace_id and relationship_type = 'ero_ptin' and status = 'active'
    ) into v_has_connection;

    if v_has_connection then
      select exists (
        select 1 from public.engagement_shares
        where engagement_id = new.id and status = 'approved'
      ) into v_has_approved_share;

      if not v_has_approved_share then
        raise exception 'This engagement must be approved by your connected ERO before it can be marked ready to release.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_ero_efile_gate on public.engagements;
create trigger trg_enforce_ero_efile_gate
  before update on public.engagements
  for each row execute function public.enforce_ero_efile_gate();
