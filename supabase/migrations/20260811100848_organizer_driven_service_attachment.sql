-- Product decision: don't guess a default service when a client is
-- created. Instead, whichever organizer the client actually completes
-- determines the service -- directly when a form belongs to exactly one
-- service, or via an explicit answer-to-service route when a firm shares
-- one form across services (e.g. one intake covering both a 1040 and a
-- 1120 client). Also: payment method (billing rule) stops being a single
-- fixed setting on the service and becomes a per-engagement choice that
-- just defaults from the service.

alter table public.workspaces
  drop column if exists default_individual_service_id,
  drop column if exists default_business_service_id;

alter table public.engagements
  add column if not exists billing_rule_id uuid references public.billing_rules(id) on delete set null;

alter table public.organizer_responses
  add column if not exists resolved_service_id uuid references public.services(id) on delete set null,
  add column if not exists needs_service_review boolean not null default false;

create table if not exists public.organizer_service_routes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  organizer_template_id uuid not null references public.organizer_templates(id) on delete cascade,
  routing_field_id uuid not null references public.organizer_fields(id) on delete cascade,
  answer_value text not null,
  service_id uuid not null references public.services(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (organizer_template_id, answer_value)
);

alter table public.organizer_service_routes enable row level security;

create policy organizer_service_routes_select on public.organizer_service_routes
  for select using (public.is_workspace_member(workspace_id));

create policy organizer_service_routes_insert on public.organizer_service_routes
  for insert with check (public.is_workspace_admin(workspace_id));

create policy organizer_service_routes_update on public.organizer_service_routes
  for update using (public.is_workspace_admin(workspace_id));

create policy organizer_service_routes_delete on public.organizer_service_routes
  for delete using (public.is_workspace_admin(workspace_id));

-- Resolves (or re-resolves) which service a submitted organizer response
-- belongs to. Pulled out as its own function (rather than only living in a
-- trigger) so submit_public_organizer_response can call it explicitly once
-- its answers are actually inserted -- the response row there is created
-- with status='submitted' from the start, before its answers exist, so an
-- AFTER INSERT trigger alone would resolve against zero answers.
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

  select count(*), min(id) into v_candidate_count, v_single_service_id
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

revoke all on function public.resolve_organizer_response_service(uuid) from public, anon;
grant execute on function public.resolve_organizer_response_service(uuid) to authenticated;

create or replace function public.trg_resolve_organizer_response_service()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status in ('submitted', 'reviewed')
     and (old.status is null or old.status not in ('submitted', 'reviewed')) then
    perform resolve_organizer_response_service(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_resolve_organizer_response_service on public.organizer_responses;
create trigger trg_resolve_organizer_response_service
  after update of status on public.organizer_responses
  for each row execute function public.trg_resolve_organizer_response_service();

-- Public-lead submissions insert the response already at status='submitted'
-- in the same call that inserts its answers, so the trigger above can't see
-- them yet -- resolve explicitly once the answers are actually in.
create or replace function public.submit_public_organizer_response(
  p_token uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
  v_template_id uuid;
  v_client_id uuid;
  v_response_id uuid;
  v_answer jsonb;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;

  select id, workspace_id into v_template_id, v_workspace_id
  from public.organizer_templates
  where public_token = p_token and is_public = true and status = 'published';

  if v_template_id is null then
    raise exception 'This link is no longer available';
  end if;

  v_client_id := public.find_or_create_public_lead(v_workspace_id, p_first_name, p_last_name, p_email, p_phone);

  insert into public.organizer_responses (workspace_id, client_id, organizer_template_id, status, submitted_at, is_public_submission)
  values (v_workspace_id, v_client_id, v_template_id, 'submitted', now(), true)
  returning id into v_response_id;

  for v_answer in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    insert into public.organizer_response_answers (organizer_response_id, organizer_field_id, value, instance_index)
    select v_response_id, (v_answer->>'field_id')::uuid, v_answer->'value', coalesce((v_answer->>'instance_index')::int, 0)
    where exists (
      select 1 from public.organizer_fields f where f.id = (v_answer->>'field_id')::uuid and f.organizer_template_id = v_template_id
    );
  end loop;

  perform public.resolve_organizer_response_service(v_response_id);

  return jsonb_build_object('ok', true, 'client_id', v_client_id, 'response_id', v_response_id);
end;
$$;

-- create_engagement gains an optional billing rule override; falls back to
-- the service's own billing rule when not passed, matching today's behavior
-- for every existing caller.
create or replace function public.create_engagement(
  p_workspace_id uuid,
  p_client_id uuid,
  p_service_id uuid,
  p_assigned_staff_id uuid default null,
  p_priority engagement_priority default 'Medium'::engagement_priority,
  p_billing_rule_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_service record;
  v_engagement_id uuid;
  v_billing_rule_id uuid;
begin
  if not has_permission(p_workspace_id, 'engagements.manage') then
    raise exception 'insufficient permissions to create an engagement in this workspace';
  end if;

  select id, process_id, billing_rule_id into v_service from services
  where id = p_service_id and (workspace_id is null or workspace_id = p_workspace_id);
  if v_service.id is null then
    raise exception 'service % not found or not accessible in this workspace', p_service_id;
  end if;

  v_billing_rule_id := coalesce(p_billing_rule_id, v_service.billing_rule_id);

  insert into engagements (workspace_id, client_id, service_id, workflow_id, assigned_staff_id, priority, billing_rule_id)
  values (p_workspace_id, p_client_id, p_service_id, v_service.process_id, p_assigned_staff_id, p_priority, v_billing_rule_id)
  returning id into v_engagement_id;

  if v_service.process_id is not null then
    perform start_engagement_workflow(v_engagement_id, v_service.process_id);
  end if;

  return v_engagement_id;
end;
$$;
