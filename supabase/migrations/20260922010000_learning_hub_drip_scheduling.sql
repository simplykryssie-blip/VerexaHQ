-- Drip scheduling: a module can now unlock on a fixed date, or N days
-- after the learner was assigned/enrolled, instead of always being
-- available the moment it's published. Both columns null (the default,
-- and every existing module's current state) keeps today's behavior --
-- always available -- fully unchanged.
alter table public.learning_modules add column release_date timestamptz;
alter table public.learning_modules add column release_offset_days int;

-- Single source of truth for "can this user open this module right now,"
-- used by both mark_lesson_complete/submit_quiz_attempt (the real
-- enforcement) and mirrored client-side (lib/learning/dripSchedule.ts) for
-- the UI lock state -- the two must agree, but only this one actually gates
-- anything.
create or replace function public.is_module_unlocked(p_module_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_module record;
  v_anchor timestamptz;
begin
  select m.course_id, m.release_date, m.release_offset_days
  into v_module
  from public.learning_modules m
  where m.id = p_module_id;

  if v_module.course_id is null then
    return false;
  end if;
  if v_module.release_date is null and v_module.release_offset_days is null then
    return true;
  end if;
  if v_module.release_date is not null and now() >= v_module.release_date then
    return true;
  end if;

  if v_module.release_offset_days is not null then
    -- Anchor to when this learner was assigned the course; if they were
    -- never formally assigned (a self-serve/unassigned course), fall back
    -- to the course's own creation date so an offset still means something.
    select a.created_at into v_anchor
    from public.learning_course_assignments a
    where a.course_id = v_module.course_id and a.user_id = p_user_id;

    if v_anchor is null then
      select c.created_at into v_anchor from public.learning_courses c where c.id = v_module.course_id;
    end if;

    if v_anchor is not null and now() >= v_anchor + (v_module.release_offset_days || ' days')::interval then
      return true;
    end if;
  end if;

  return false;
end;
$function$;

grant execute on function public.is_module_unlocked(uuid, uuid) to authenticated;

-- Also close the same gap in get_quiz_for_taking -- otherwise a locked
-- quiz's questions (though not its answer key) could still be fetched
-- early even though submitting them would be rejected, undermining the
-- point of drip-scheduling a quiz.
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
  if not public.is_module_unlocked(p_module_id, auth.uid()) then
    raise exception 'this quiz is not available yet';
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
  if not public.is_module_unlocked(p_module_id, auth.uid()) then
    raise exception 'this lesson is not available yet';
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
  if not public.is_module_unlocked(p_module_id, auth.uid()) then
    raise exception 'this quiz is not available yet';
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
