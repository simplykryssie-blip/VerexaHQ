-- Mirrors the existing apply_engagement_default_assignment trigger: when an
-- assignment field is left null, fall back to the workspace owner instead of
-- staying unassigned. Independent-PTIN workspaces only ever have one active
-- staff member (the owner), so this is what makes every assignment field
-- resolve to them instead of showing "Unassigned" -- and it's a sane default
-- for larger firms too (falls back to the owner/admin rather than nobody).

create or replace function public.apply_client_default_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner_id uuid;
begin
  if new.relationship_manager_id is null or new.default_reviewer_id is null or new.default_compliance_officer_id is null then
    select wu.user_id into v_owner_id
    from public.workspace_users wu
    where wu.workspace_id = new.workspace_id and wu.is_owner and wu.status = 'active'
    limit 1;

    new.relationship_manager_id := coalesce(new.relationship_manager_id, v_owner_id);
    new.default_reviewer_id := coalesce(new.default_reviewer_id, v_owner_id);
    new.default_compliance_officer_id := coalesce(new.default_compliance_officer_id, v_owner_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_apply_client_default_assignment on public.clients;
create trigger trg_apply_client_default_assignment
  before insert on public.clients
  for each row execute function public.apply_client_default_assignment();

create or replace function public.apply_workflow_stage_default_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner_id uuid;
begin
  if new.assigned_staff_id is null or new.reviewer_id is null then
    select wu.user_id into v_owner_id
    from public.workspace_users wu
    where wu.workspace_id = new.workspace_id and wu.is_owner and wu.status = 'active'
    limit 1;

    new.assigned_staff_id := coalesce(new.assigned_staff_id, v_owner_id);
    new.reviewer_id := coalesce(new.reviewer_id, v_owner_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_apply_workflow_stage_default_assignment on public.workflow_stages;
create trigger trg_apply_workflow_stage_default_assignment
  before insert on public.workflow_stages
  for each row execute function public.apply_workflow_stage_default_assignment();

-- Backfill existing rows that predate these triggers.
update public.clients c
set
  relationship_manager_id = coalesce(c.relationship_manager_id, o.user_id),
  default_reviewer_id = coalesce(c.default_reviewer_id, o.user_id),
  default_compliance_officer_id = coalesce(c.default_compliance_officer_id, o.user_id)
from public.workspace_users o
where o.workspace_id = c.workspace_id and o.is_owner and o.status = 'active'
  and (c.relationship_manager_id is null or c.default_reviewer_id is null or c.default_compliance_officer_id is null);

update public.engagements e
set
  reviewer_id = coalesce(e.reviewer_id, o.user_id),
  compliance_officer_id = coalesce(e.compliance_officer_id, o.user_id)
from public.workspace_users o
where o.workspace_id = e.workspace_id and o.is_owner and o.status = 'active'
  and (e.reviewer_id is null or e.compliance_officer_id is null);

update public.workflow_stages s
set
  assigned_staff_id = coalesce(s.assigned_staff_id, o.user_id),
  reviewer_id = coalesce(s.reviewer_id, o.user_id)
from public.workspace_users o
where o.workspace_id = s.workspace_id and o.is_owner and o.status = 'active'
  and (s.assigned_staff_id is null or s.reviewer_id is null);
