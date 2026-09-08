-- Learning Hub was a flat, self-serve course catalog with no way to find
-- training by topic or push it to specific people -- this adds both
-- without touching the existing course/module/quiz/completion model.

alter table public.learning_courses add column category text;

-- Assigning a course to specific staff (with an optional due date) is
-- distinct from a completion record: an assignment can exist before
-- anyone has started the course, and a manager needs to see who hasn't
-- started an assigned course, not just who has finished one.
create table public.learning_course_assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.learning_courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  assigned_by uuid references auth.users(id),
  due_date date,
  created_at timestamptz not null default now(),
  unique (course_id, user_id)
);
create index learning_course_assignments_user_id_idx on public.learning_course_assignments (user_id);
create index learning_course_assignments_course_id_idx on public.learning_course_assignments (course_id);

alter table public.learning_course_assignments enable row level security;

-- Mirrors learning_module_completions_select's shape exactly: the
-- assignee sees their own row, a manager of the owning workspace sees
-- everyone's.
create policy learning_course_assignments_select on public.learning_course_assignments
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.learning_courses c where c.id = learning_course_assignments.course_id and public.has_permission(c.owner_workspace_id, 'learning_hub.manage'))
  );
-- No direct INSERT/UPDATE/DELETE policy -- writes only ever go through
-- assign_learning_course/unassign_learning_course (SECURITY DEFINER),
-- which validate both that the caller can manage the course *and* that
-- the target user actually has access to it (a plain RLS insert policy
-- can't cheaply re-check has_learning_hub_access for an arbitrary
-- target user_id the way these functions do).

create or replace function public.assign_learning_course(p_course_id uuid, p_user_id uuid, p_due_date date default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner_workspace_id uuid;
  v_assignee_workspace_id uuid;
begin
  select owner_workspace_id into v_owner_workspace_id from public.learning_courses where id = p_course_id;
  if v_owner_workspace_id is null then
    raise exception 'course not found';
  end if;
  if not public.has_permission(v_owner_workspace_id, 'learning_hub.manage') then
    raise exception 'insufficient permissions to assign this course';
  end if;

  select workspace_id into v_assignee_workspace_id
  from public.workspace_users
  where user_id = p_user_id and status = 'active'
  order by created_at asc
  limit 1;
  -- The assignee must actually be able to see this course: a member of
  -- the owning workspace itself, or of a firm directly connected to it
  -- (the same reach has_learning_hub_access grants, just checked against
  -- the *target* user's workspace instead of the caller's).
  if v_assignee_workspace_id is null or not (
    v_assignee_workspace_id = v_owner_workspace_id
    or exists (
      select 1 from public.firm_connections fc
      where fc.parent_workspace_id = v_owner_workspace_id
        and fc.child_workspace_id = v_assignee_workspace_id
        and fc.status = 'active'
    )
  ) then
    raise exception 'that person does not have access to this course';
  end if;

  insert into public.learning_course_assignments (course_id, user_id, workspace_id, assigned_by, due_date)
  values (p_course_id, p_user_id, v_assignee_workspace_id, auth.uid(), p_due_date)
  on conflict (course_id, user_id) do update set due_date = excluded.due_date;
end;
$function$;

create or replace function public.unassign_learning_course(p_course_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner_workspace_id uuid;
begin
  select owner_workspace_id into v_owner_workspace_id from public.learning_courses where id = p_course_id;
  if v_owner_workspace_id is null or not public.has_permission(v_owner_workspace_id, 'learning_hub.manage') then
    raise exception 'insufficient permissions to unassign this course';
  end if;

  delete from public.learning_course_assignments where course_id = p_course_id and user_id = p_user_id;
end;
$function$;

grant execute on function public.assign_learning_course(uuid, uuid, date) to authenticated;
grant execute on function public.unassign_learning_course(uuid, uuid) to authenticated;

-- get_learning_completion_rollup's assignment-aware twin: who is (or
-- isn't) making progress on what they were actually assigned, not just
-- a flat completion log. Left-joins completions per module so an
-- assignee who hasn't started shows up with nulls rather than being
-- absent from the report entirely.
create or replace function public.get_learning_assignment_rollup(p_owner_workspace_id uuid)
returns table (
  assignment_id uuid,
  user_id uuid,
  user_email text,
  course_id uuid,
  course_title text,
  due_date date,
  assigned_at timestamptz,
  total_modules bigint,
  completed_modules bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.has_permission(p_owner_workspace_id, 'learning_hub.manage') then
    raise exception 'insufficient permissions to view this rollup';
  end if;

  return query
    select
      a.id, a.user_id, u.email,
      c.id, c.title, a.due_date, a.created_at,
      count(m.id),
      count(lmc.id) filter (where lmc.passed)
    from public.learning_course_assignments a
    join public.learning_courses c on c.id = a.course_id
    left join auth.users u on u.id = a.user_id
    left join public.learning_modules m on m.course_id = c.id
    left join public.learning_module_completions lmc on lmc.module_id = m.id and lmc.user_id = a.user_id
    where c.owner_workspace_id = p_owner_workspace_id
    group by a.id, a.user_id, u.email, c.id, c.title, a.due_date, a.created_at
    order by a.due_date asc nulls last, a.created_at desc;
end;
$function$;

grant execute on function public.get_learning_assignment_rollup(uuid) to authenticated;
