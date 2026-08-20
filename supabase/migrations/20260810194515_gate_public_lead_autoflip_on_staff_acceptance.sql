-- A lead who fills out an organizer via an anonymous public link (no staff
-- involvement yet) should stay a lead until a staff member reviews and
-- accepts them -- the previous trigger auto-flipped ANY lead to 'active' the
-- moment their organizer_response hit 'submitted', which skipped that
-- review step for public-link submissions specifically. Staff-initiated
-- organizer sends (QuickActions, NewEngagementForm, portal follow-ups on an
-- already-known client) still auto-flip as before -- only the anonymous
-- public-link path is gated now.

alter table public.organizer_responses
  add column if not exists is_public_submission boolean not null default false;

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

  return jsonb_build_object('ok', true, 'client_id', v_client_id);
end;
$$;

create or replace function public.flip_lead_on_organizer_submission()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.is_public_submission then
    return new;
  end if;
  if new.status in ('submitted', 'reviewed')
     and (old.status is null or old.status not in ('submitted', 'reviewed')) then
    update public.clients
      set lifecycle_status = 'active'
      where id = new.client_id and lifecycle_status = 'lead';
  end if;
  return new;
end;
$$;
