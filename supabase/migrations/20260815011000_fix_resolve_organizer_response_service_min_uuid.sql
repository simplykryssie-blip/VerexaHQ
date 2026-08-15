-- Pre-existing bug, unrelated to the combined-template work in the same
-- session -- found while smoke-testing that it doesn't break organizer
-- submission: `select count(*), min(id) ... from services` fails outright
-- because Postgres has no MIN aggregate for uuid. This makes
-- resolve_organizer_response_service (called by every single organizer
-- submission, public or portal, once no explicit routing_field_id is
-- configured) raise on every call -- currently invisible only because
-- organizer_templates is empty in this environment; it will break the
-- first real submission otherwise. min(id) is only ever read when
-- count = 1 (unambiguous single match), so casting through text is a safe,
-- minimal fix -- no behavior change for count = 0 or count > 1, where the
-- value is discarded anyway.
create or replace function public.resolve_organizer_response_service(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_response record;
  v_routing_field_id uuid;
  v_given_value text;
  v_matched_service_id uuid;
  v_candidate_count int;
  v_single_service_id uuid;
begin
  select id, workspace_id, organizer_template_id, engagement_id into v_response
  from organizer_responses where id = p_response_id;

  if v_response.id is null or v_response.engagement_id is not null then
    return;
  end if;

  select routing_field_id into v_routing_field_id
  from organizer_service_routes
  where organizer_template_id = v_response.organizer_template_id
  limit 1;

  if v_routing_field_id is not null then
    select value #>> '{}' into v_given_value
    from organizer_response_answers
    where organizer_response_id = v_response.id and organizer_field_id = v_routing_field_id
    order by instance_index
    limit 1;

    v_matched_service_id := null;
    if v_given_value is not null then
      select service_id into v_matched_service_id
      from organizer_service_routes
      where organizer_template_id = v_response.organizer_template_id
        and answer_value = v_given_value;
    end if;

    update organizer_responses
    set resolved_service_id = v_matched_service_id,
        needs_service_review = (v_matched_service_id is null)
    where id = v_response.id;
    return;
  end if;

  select count(*), min(id::text)::uuid into v_candidate_count, v_single_service_id
  from services
  where organizer_template_id = v_response.organizer_template_id
    and workspace_id = v_response.workspace_id;

  if v_candidate_count = 1 then
    update organizer_responses set resolved_service_id = v_single_service_id, needs_service_review = false where id = v_response.id;
  elsif v_candidate_count > 1 then
    update organizer_responses set resolved_service_id = null, needs_service_review = true where id = v_response.id;
  end if;
end;
$$;
