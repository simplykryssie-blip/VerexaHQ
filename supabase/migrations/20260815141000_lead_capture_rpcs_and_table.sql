create table public.client_service_interests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service_category_id uuid references public.service_categories(id),
  service_id uuid references public.services(id),
  source text not null check (source in ('public_organizer_signup', 'manual')),
  created_at timestamptz not null default now()
);

create index client_service_interests_client_idx on public.client_service_interests (client_id, created_at desc);

alter table public.client_service_interests enable row level security;

create policy client_service_interests_select
  on public.client_service_interests for select
  using (public.is_workspace_member(workspace_id));

-- No insert/update/delete policy -- writes only happen via
-- capture_public_lead_from_contact_step (SECURITY DEFINER, below).

create or replace function public._notify_admins_of_new_public_lead(p_workspace_id uuid, p_client_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_recipient record;
begin
  for v_recipient in
    select wu.user_id from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    where wu.workspace_id = p_workspace_id and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  loop
    perform public.create_notification(
      p_workspace_id, v_recipient.user_id, 'PUBLIC_LEAD_CREATED',
      'public_lead_created', jsonb_build_object('client_id', p_client_id),
      array['In-App'::text], 'Medium', 'client', p_client_id
    );
  end loop;
end;
$$;

revoke all on function public._notify_admins_of_new_public_lead(uuid, uuid) from public, anon, authenticated;

create or replace function public.get_public_service_options(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
begin
  select ot.workspace_id into v_workspace_id
  from public.organizer_templates ot
  where ot.public_token = p_token and ot.is_public = true and ot.status = 'published';

  if v_workspace_id is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', sc.id,
      'name', sc.name,
      'services', (
        select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.display_order), '[]'::jsonb)
        from public.services s
        where s.service_category_id = sc.id
          and s.status = 'published'
          and (s.workspace_id is null or s.workspace_id = v_workspace_id)
      )
    ) order by sc.display_order)
    from public.service_categories sc
    where sc.workspace_id is null or sc.workspace_id = v_workspace_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_public_service_options(uuid) from public;
grant execute on function public.get_public_service_options(uuid) to anon, authenticated;

create or replace function public.capture_public_lead_from_contact_step(
  p_token uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_service_category_id uuid,
  p_service_id uuid,
  p_auth_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
  v_client_id uuid;
begin
  select ot.workspace_id into v_workspace_id
  from public.organizer_templates ot
  where ot.public_token = p_token and ot.is_public = true and ot.status = 'published';

  if v_workspace_id is null then
    raise exception 'This link is no longer available';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;

  v_client_id := public.find_or_create_public_lead(v_workspace_id, p_first_name, p_last_name, p_email, p_phone);

  insert into public.client_service_interests (client_id, workspace_id, service_category_id, service_id, source)
  values (v_client_id, v_workspace_id, p_service_category_id, p_service_id, 'public_organizer_signup');

  if p_auth_user_id is not null then
    perform public.link_public_portal_account(v_workspace_id, v_client_id, p_auth_user_id, p_email, btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')));
  end if;

  perform public._notify_admins_of_new_public_lead(v_workspace_id, v_client_id);

  return jsonb_build_object('client_id', v_client_id);
end;
$$;

revoke all on function public.capture_public_lead_from_contact_step(uuid, text, text, text, text, uuid, uuid, uuid) from public;
grant execute on function public.capture_public_lead_from_contact_step(uuid, text, text, text, text, uuid, uuid, uuid) to anon, authenticated;

create or replace function public.submit_public_organizer_response(
  p_token uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_answers jsonb,
  p_client_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_template_id uuid;
  v_client_id uuid;
  v_client_name text;
  v_response_id uuid;
  v_answer jsonb;
  v_signature_request_id uuid;
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

  v_client_id := coalesce(p_client_id, public.find_or_create_public_lead(v_workspace_id, p_first_name, p_last_name, p_email, p_phone));
  v_client_name := btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));

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
  v_signature_request_id := public.resolve_and_sign_organizer_response(v_response_id, v_workspace_id, v_template_id, v_client_name, p_email);

  return jsonb_build_object('ok', true, 'client_id', v_client_id, 'response_id', v_response_id, 'signature_request_id', v_signature_request_id);
end;
$function$;

create or replace function public.submit_public_organizer_response_with_signup(
  p_token uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_answers jsonb, p_auth_user_id uuid,
  p_client_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_template_id uuid;
  v_requires_signup boolean;
  v_client_id uuid;
  v_client_name text;
  v_response_id uuid;
  v_answer jsonb;
  v_signature_request_id uuid;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;
  if p_auth_user_id is null then
    raise exception 'A portal account is required for this link';
  end if;

  select id, workspace_id, requires_portal_signup into v_template_id, v_workspace_id, v_requires_signup
  from public.organizer_templates
  where public_token = p_token and is_public = true and status = 'published';

  if v_template_id is null then
    raise exception 'This link is no longer available';
  end if;
  if not v_requires_signup then
    raise exception 'This organizer does not use portal signup';
  end if;

  v_client_id := coalesce(p_client_id, public.find_or_create_public_lead(v_workspace_id, p_first_name, p_last_name, p_email, p_phone));
  v_client_name := btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));

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
  perform public.link_public_portal_account(v_workspace_id, v_client_id, p_auth_user_id, p_email, v_client_name);
  v_signature_request_id := public.resolve_and_sign_organizer_response(v_response_id, v_workspace_id, v_template_id, v_client_name, p_email);

  return jsonb_build_object('ok', true, 'client_id', v_client_id, 'response_id', v_response_id, 'signature_request_id', v_signature_request_id);
end;
$function$;
