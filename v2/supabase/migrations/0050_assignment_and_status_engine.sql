-- Epic 3A: Engagement Foundation -- Part 3 (Assignment Engine + Status Engine).
--
-- Assignment Engine: every new Engagement defaults its assignment to the
-- workspace owner (workspace_users.is_owner) when the caller doesn't supply
-- one -- for an Independent PTIN, that owner typically *is* the preparer
-- doing the work; for an ERO Office, the owner is nominally accountable even
-- though the work usually gets reassigned to staff shortly after. Every
-- assignment change (assigned_staff_id / reviewer_id / compliance_officer_id)
-- is captured in engagement_assignment_history -- no assignment change is
-- ever silent.
--
-- Status Engine: engagements.status never gets overwritten silently either --
-- a trigger snapshots every change into the existing (already-live)
-- engagement_status_history table, and auto-stamps completed_date/
-- archived_date on the two terminal transitions instead of requiring every
-- caller to remember to set them.

-- ============================================================================
-- 1. engagement_assignment_history
-- ============================================================================
create table public.engagement_assignment_history (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  assignment_role text not null check (assignment_role in ('assigned_staff', 'reviewer', 'compliance_officer')),
  previous_user_id uuid references public.user_profiles(id),
  new_user_id uuid references public.user_profiles(id),
  changed_by uuid references public.user_profiles(id),
  changed_at timestamptz not null default now(),
  reason text
);
comment on table public.engagement_assignment_history is 'Every change to engagements.assigned_staff_id/reviewer_id/compliance_officer_id, captured automatically -- reassignment is supported by simply updating the engagements row; this table is the audit trail, not a separate assignment workflow.';

create index idx_engagement_assignment_history_engagement on public.engagement_assignment_history (engagement_id, changed_at desc);

alter table public.engagement_assignment_history enable row level security;
create policy engagement_assignment_history_select on public.engagement_assignment_history for select using (
  exists (select 1 from public.engagements e where e.id = engagement_assignment_history.engagement_id and public.has_permission(e.workspace_id, 'engagements.view'))
);
-- No insert/update/delete policy for authenticated: written only by the
-- trigger below (SECURITY DEFINER), same insert-only pattern as audit_log.

-- ============================================================================
-- 2. Default assignment on insert (workspace owner, per the rule above) +
--    capture every assignment change on update.
-- ============================================================================
create or replace function public.apply_engagement_default_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  if new.assigned_staff_id is null then
    select wu.user_id into v_owner_id
    from public.workspace_users wu
    where wu.workspace_id = new.workspace_id and wu.is_owner and wu.status = 'active'
    limit 1;
    new.assigned_staff_id := v_owner_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.apply_engagement_default_assignment() from public, anon;

create trigger apply_engagement_default_assignment before insert on public.engagements
for each row execute function public.apply_engagement_default_assignment();

create or replace function public.record_engagement_assignment_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_staff_id is distinct from old.assigned_staff_id then
    insert into public.engagement_assignment_history (engagement_id, assignment_role, previous_user_id, new_user_id, changed_by)
    values (new.id, 'assigned_staff', old.assigned_staff_id, new.assigned_staff_id, (select auth.uid()));
  end if;
  if new.reviewer_id is distinct from old.reviewer_id then
    insert into public.engagement_assignment_history (engagement_id, assignment_role, previous_user_id, new_user_id, changed_by)
    values (new.id, 'reviewer', old.reviewer_id, new.reviewer_id, (select auth.uid()));
  end if;
  if new.compliance_officer_id is distinct from old.compliance_officer_id then
    insert into public.engagement_assignment_history (engagement_id, assignment_role, previous_user_id, new_user_id, changed_by)
    values (new.id, 'compliance_officer', old.compliance_officer_id, new.compliance_officer_id, (select auth.uid()));
  end if;
  return new;
end;
$$;

revoke execute on function public.record_engagement_assignment_changes() from public, anon;

create trigger record_engagement_assignment_changes after update of assigned_staff_id, reviewer_id, compliance_officer_id on public.engagements
for each row execute function public.record_engagement_assignment_changes();

-- ============================================================================
-- 3. Status Engine: auto-history + terminal date stamping. Never overwrites
--    -- every change lands a new engagement_status_history row.
-- ============================================================================
create or replace function public.record_engagement_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.engagement_status_history (engagement_id, old_status, new_status, changed_by)
    values (new.id, old.status, new.status, (select auth.uid()));

    if new.status = 'Completed' and new.completed_date is null then
      new.completed_date := now();
    end if;
    if new.status = 'Archived' and new.archived_date is null then
      new.archived_date := now();
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.record_engagement_status_change() from public, anon;

create trigger record_engagement_status_change before update of status on public.engagements
for each row execute function public.record_engagement_status_change();
