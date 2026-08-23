-- Staff Learning Hub: an ERO/Service Bureau builds training content once
-- (courses -> modules, each a lesson or a quiz) and it's automatically
-- visible to staff at every workspace connected to them via an active
-- firm_connections row -- not per-workspace content like everything else
-- in this schema (services, pipelines, automations, templates).
--
-- Visibility follows the same direct-parent-to-child pattern already
-- established by get_ero_return_status/get_ero_irs_notices (no
-- multi-level recursion through the hierarchy -- a Service Bureau's
-- courses reach its directly-connected EROs and PTINs, an ERO's reach
-- its directly-connected PTINs, matching every other cross-firm rollup
-- in this codebase).
--
-- Quiz answer keys (learning_quiz_options.is_correct) are never exposed
-- to a plain SELECT by anyone without learning_hub.manage -- staff taking
-- a quiz only ever see it through get_quiz_for_taking (below), which
-- strips is_correct, and grading happens server-side in
-- submit_quiz_attempt.

insert into public.permissions (key, category, description)
values ('learning_hub.manage', 'learning_hub', 'Create and edit training courses, modules, and quizzes for this firm and its connected offices');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null
  and r.slug in ('owner', 'admin', 'ero', 'manager')
  and p.key = 'learning_hub.manage';

create or replace function public.has_learning_hub_access(p_owner_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.is_workspace_member(p_owner_workspace_id)
    or exists (
      select 1 from public.firm_connections fc
      where fc.parent_workspace_id = p_owner_workspace_id
        and fc.status = 'active'
        and fc.child_workspace_id is not null
        and public.is_workspace_member(fc.child_workspace_id)
    );
$function$;

create table public.learning_courses (
  id uuid primary key default gen_random_uuid(),
  owner_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  display_order int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index learning_courses_owner_workspace_id_idx on public.learning_courses (owner_workspace_id);

create table public.learning_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.learning_courses(id) on delete cascade,
  module_type text not null check (module_type in ('lesson', 'quiz')),
  title text not null,
  display_order int not null default 0,
  body text,
  video_url text,
  passing_score_percent int not null default 70,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index learning_modules_course_id_idx on public.learning_modules (course_id);

create table public.learning_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.learning_modules(id) on delete cascade,
  question_text text not null,
  display_order int not null default 0
);
create index learning_quiz_questions_module_id_idx on public.learning_quiz_questions (module_id);

create table public.learning_quiz_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.learning_quiz_questions(id) on delete cascade,
  option_text text not null,
  is_correct boolean not null default false,
  display_order int not null default 0
);
create index learning_quiz_options_question_id_idx on public.learning_quiz_options (question_id);

create table public.learning_module_completions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.learning_modules(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  score_percent int,
  passed boolean,
  completed_at timestamptz not null default now(),
  unique (module_id, user_id)
);
create index learning_module_completions_user_id_idx on public.learning_module_completions (user_id);
create index learning_module_completions_workspace_id_idx on public.learning_module_completions (workspace_id);

alter table public.learning_courses enable row level security;
alter table public.learning_modules enable row level security;
alter table public.learning_quiz_questions enable row level security;
alter table public.learning_quiz_options enable row level security;
alter table public.learning_module_completions enable row level security;

create policy learning_courses_select on public.learning_courses
  for select using (
    public.has_learning_hub_access(owner_workspace_id)
    and (status = 'published' or public.is_workspace_member(owner_workspace_id))
  );
create policy learning_courses_insert on public.learning_courses
  for insert with check (public.has_permission(owner_workspace_id, 'learning_hub.manage'));
create policy learning_courses_update on public.learning_courses
  for update using (public.has_permission(owner_workspace_id, 'learning_hub.manage'));
create policy learning_courses_delete on public.learning_courses
  for delete using (public.has_permission(owner_workspace_id, 'learning_hub.manage'));

create policy learning_modules_select on public.learning_modules
  for select using (
    exists (
      select 1 from public.learning_courses c
      where c.id = learning_modules.course_id
        and public.has_learning_hub_access(c.owner_workspace_id)
        and (c.status = 'published' or public.is_workspace_member(c.owner_workspace_id))
    )
  );
create policy learning_modules_insert on public.learning_modules
  for insert with check (
    exists (select 1 from public.learning_courses c where c.id = learning_modules.course_id and public.has_permission(c.owner_workspace_id, 'learning_hub.manage'))
  );
create policy learning_modules_update on public.learning_modules
  for update using (
    exists (select 1 from public.learning_courses c where c.id = learning_modules.course_id and public.has_permission(c.owner_workspace_id, 'learning_hub.manage'))
  );
create policy learning_modules_delete on public.learning_modules
  for delete using (
    exists (select 1 from public.learning_courses c where c.id = learning_modules.course_id and public.has_permission(c.owner_workspace_id, 'learning_hub.manage'))
  );

create policy learning_quiz_questions_select on public.learning_quiz_questions
  for select using (
    exists (
      select 1 from public.learning_modules m
      join public.learning_courses c on c.id = m.course_id
      where m.id = learning_quiz_questions.module_id
        and public.has_learning_hub_access(c.owner_workspace_id)
        and (c.status = 'published' or public.is_workspace_member(c.owner_workspace_id))
    )
  );
create policy learning_quiz_questions_insert on public.learning_quiz_questions
  for insert with check (
    exists (
      select 1 from public.learning_modules m join public.learning_courses c on c.id = m.course_id
      where m.id = learning_quiz_questions.module_id and public.has_permission(c.owner_workspace_id, 'learning_hub.manage')
    )
  );
create policy learning_quiz_questions_update on public.learning_quiz_questions
  for update using (
    exists (
      select 1 from public.learning_modules m join public.learning_courses c on c.id = m.course_id
      where m.id = learning_quiz_questions.module_id and public.has_permission(c.owner_workspace_id, 'learning_hub.manage')
    )
  );
create policy learning_quiz_questions_delete on public.learning_quiz_questions
  for delete using (
    exists (
      select 1 from public.learning_modules m join public.learning_courses c on c.id = m.course_id
      where m.id = learning_quiz_questions.module_id and public.has_permission(c.owner_workspace_id, 'learning_hub.manage')
    )
  );

-- Only learning_hub.manage holders can SELECT options directly (the
-- editor needs is_correct); everyone else takes a quiz through
-- get_quiz_for_taking, which strips it.
create policy learning_quiz_options_select on public.learning_quiz_options
  for select using (
    exists (
      select 1 from public.learning_quiz_questions q
      join public.learning_modules m on m.id = q.module_id
      join public.learning_courses c on c.id = m.course_id
      where q.id = learning_quiz_options.question_id and public.has_permission(c.owner_workspace_id, 'learning_hub.manage')
    )
  );
create policy learning_quiz_options_insert on public.learning_quiz_options
  for insert with check (
    exists (
      select 1 from public.learning_quiz_questions q
      join public.learning_modules m on m.id = q.module_id
      join public.learning_courses c on c.id = m.course_id
      where q.id = learning_quiz_options.question_id and public.has_permission(c.owner_workspace_id, 'learning_hub.manage')
    )
  );
create policy learning_quiz_options_update on public.learning_quiz_options
  for update using (
    exists (
      select 1 from public.learning_quiz_questions q
      join public.learning_modules m on m.id = q.module_id
      join public.learning_courses c on c.id = m.course_id
      where q.id = learning_quiz_options.question_id and public.has_permission(c.owner_workspace_id, 'learning_hub.manage')
    )
  );
create policy learning_quiz_options_delete on public.learning_quiz_options
  for delete using (
    exists (
      select 1 from public.learning_quiz_questions q
      join public.learning_modules m on m.id = q.module_id
      join public.learning_courses c on c.id = m.course_id
      where q.id = learning_quiz_options.question_id and public.has_permission(c.owner_workspace_id, 'learning_hub.manage')
    )
  );

create policy learning_module_completions_select on public.learning_module_completions
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.learning_modules m join public.learning_courses c on c.id = m.course_id
      where m.id = learning_module_completions.module_id and public.has_permission(c.owner_workspace_id, 'learning_hub.manage')
    )
  );
-- No direct INSERT/UPDATE policy -- completions are only ever written by
-- mark_lesson_complete/submit_quiz_attempt (SECURITY DEFINER), which
-- validate access and, for quizzes, grade server-side so the answer key
-- never has to reach the client.

create or replace function public.mark_lesson_complete(p_module_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_module record;
  v_workspace_id uuid;
begin
  select m.id, m.module_type, c.owner_workspace_id into v_module
  from public.learning_modules m join public.learning_courses c on c.id = m.course_id
  where m.id = p_module_id;

  if v_module.id is null then
    raise exception 'module not found';
  end if;
  if v_module.module_type <> 'lesson' then
    raise exception 'this module is a quiz -- submit it with submit_quiz_attempt instead';
  end if;
  if not public.has_learning_hub_access(v_module.owner_workspace_id) then
    raise exception 'insufficient access to this course';
  end if;

  select workspace_id into v_workspace_id
  from public.workspace_users
  where user_id = auth.uid() and status = 'active'
  order by created_at asc
  limit 1;

  insert into public.learning_module_completions (module_id, user_id, workspace_id, passed, completed_at)
  values (p_module_id, auth.uid(), v_workspace_id, true, now())
  on conflict (module_id, user_id) do update set completed_at = now(), passed = true;
end;
$function$;

create or replace function public.get_quiz_for_taking(p_module_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_module record;
begin
  select m.id, m.title, m.passing_score_percent, c.owner_workspace_id into v_module
  from public.learning_modules m join public.learning_courses c on c.id = m.course_id
  where m.id = p_module_id and m.module_type = 'quiz';

  if v_module.id is null then
    raise exception 'quiz not found';
  end if;
  if not public.has_learning_hub_access(v_module.owner_workspace_id) then
    raise exception 'insufficient access to this course';
  end if;

  return jsonb_build_object(
    'module_id', v_module.id,
    'title', v_module.title,
    'passing_score_percent', v_module.passing_score_percent,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'question_text', q.question_text,
        'options', (
          select jsonb_agg(jsonb_build_object('id', o.id, 'option_text', o.option_text) order by o.display_order)
          from public.learning_quiz_options o where o.question_id = q.id
        )
      ) order by q.display_order)
      from public.learning_quiz_questions q where q.module_id = v_module.id
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.submit_quiz_attempt(p_module_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_module record;
  v_workspace_id uuid;
  v_total int;
  v_correct int := 0;
  v_answer record;
  v_score int;
  v_passed boolean;
begin
  select m.id, m.passing_score_percent, c.owner_workspace_id into v_module
  from public.learning_modules m join public.learning_courses c on c.id = m.course_id
  where m.id = p_module_id and m.module_type = 'quiz';

  if v_module.id is null then
    raise exception 'quiz not found';
  end if;
  if not public.has_learning_hub_access(v_module.owner_workspace_id) then
    raise exception 'insufficient access to this course';
  end if;

  select count(*) into v_total from public.learning_quiz_questions where module_id = p_module_id;
  if v_total = 0 then
    raise exception 'this quiz has no questions yet';
  end if;

  for v_answer in select * from jsonb_to_recordset(p_answers) as x(question_id uuid, selected_option_id uuid)
  loop
    if exists (
      select 1 from public.learning_quiz_options o
      where o.id = v_answer.selected_option_id and o.question_id = v_answer.question_id and o.is_correct
    ) then
      v_correct := v_correct + 1;
    end if;
  end loop;

  v_score := round((v_correct::numeric / v_total::numeric) * 100);
  v_passed := v_score >= v_module.passing_score_percent;

  select workspace_id into v_workspace_id
  from public.workspace_users
  where user_id = auth.uid() and status = 'active'
  order by created_at asc
  limit 1;

  insert into public.learning_module_completions (module_id, user_id, workspace_id, score_percent, passed, completed_at)
  values (p_module_id, auth.uid(), v_workspace_id, v_score, v_passed, now())
  on conflict (module_id, user_id) do update set score_percent = v_score, passed = v_passed, completed_at = now();

  return jsonb_build_object('score_percent', v_score, 'passed', v_passed, 'correct', v_correct, 'total', v_total);
end;
$function$;

-- Same rollup shape as get_ero_return_status: caller must manage the
-- owning workspace's learning hub; results cover that workspace plus
-- every directly-connected active child.
create or replace function public.get_learning_completion_rollup(p_owner_workspace_id uuid)
returns table (
  source_workspace_id uuid,
  source_workspace_name text,
  user_id uuid,
  user_email text,
  course_id uuid,
  course_title text,
  module_id uuid,
  module_title text,
  module_type text,
  score_percent int,
  passed boolean,
  completed_at timestamptz
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
    with target_workspaces as (
      select p_owner_workspace_id as workspace_id, w.name as workspace_name
      from public.workspaces w where w.id = p_owner_workspace_id
      union all
      select fc.child_workspace_id, cw.name
      from public.firm_connections fc
      join public.workspaces cw on cw.id = fc.child_workspace_id
      where fc.parent_workspace_id = p_owner_workspace_id
        and fc.status = 'active'
    )
    select
      tw.workspace_id, tw.workspace_name,
      lmc.user_id, u.email,
      c.id, c.title, m.id, m.title, m.module_type,
      lmc.score_percent, lmc.passed, lmc.completed_at
    from public.learning_module_completions lmc
    join target_workspaces tw on tw.workspace_id = lmc.workspace_id
    join public.learning_modules m on m.id = lmc.module_id
    join public.learning_courses c on c.id = m.course_id
    left join auth.users u on u.id = lmc.user_id
    where c.owner_workspace_id = p_owner_workspace_id
    order by lmc.completed_at desc;
end;
$function$;

grant execute on function public.has_learning_hub_access(uuid) to authenticated;
grant execute on function public.mark_lesson_complete(uuid) to authenticated;
grant execute on function public.get_quiz_for_taking(uuid) to authenticated;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;
grant execute on function public.get_learning_completion_rollup(uuid) to authenticated;
