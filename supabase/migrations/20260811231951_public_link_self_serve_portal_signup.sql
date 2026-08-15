-- Per-template opt-in: a public organizer/engagement-letter link can create a
-- real portal account inline, in the same anonymous submission, without
-- waiting on email confirmation or any staff invite. Only meaningful once
-- is_public is already on (enforced at the DB level too, not just the UI).

alter table public.organizer_templates
  add column requires_portal_signup boolean not null default false;
alter table public.organizer_templates
  add constraint organizer_templates_signup_requires_public_check
    check (not requires_portal_signup or is_public);

alter table public.engagement_letter_templates
  add column requires_portal_signup boolean not null default false;
alter table public.engagement_letter_templates
  add constraint engagement_letter_templates_signup_requires_public_check
    check (not requires_portal_signup or is_public);

-- Internal helper, mirrors find_or_create_public_lead's convention: never
-- granted to anon/authenticated, only callable from another SECURITY DEFINER
-- function that has already independently validated a public token.
-- Idempotent so a retried submission doesn't double-insert or error.
-- Verifies the auth user's real email matches what was submitted, since
-- unlike the staff-invite flow this isn't pinned to a staff-chosen email.
create or replace function public.link_public_portal_account(
  p_workspace_id uuid,
  p_client_id uuid,
  p_auth_user_id uuid,
  p_email text,
  p_name text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_auth_email text;
  v_is_primary boolean;
begin
  select email into v_auth_email from auth.users where id = p_auth_user_id;
  if v_auth_email is null or lower(v_auth_email) <> lower(btrim(p_email)) then
    raise exception 'account verification failed';
  end if;

  if exists (select 1 from public.client_portal_users where client_id = p_client_id and user_id = p_auth_user_id) then
    return;
  end if;

  v_is_primary := not exists (
    select 1 from public.client_portal_users where client_id = p_client_id and status = 'active'
  );

  insert into public.client_portal_users (client_id, workspace_id, invited_email, invited_name, is_primary, status, user_id, accepted_at)
  values (p_client_id, p_workspace_id, lower(btrim(p_email)), nullif(btrim(p_name), ''), v_is_primary, 'active', p_auth_user_id, now());
end;
$function$;

revoke all on function public.link_public_portal_account(uuid, uuid, uuid, text, text) from public, anon, authenticated;

-- Organizer public intake with inline signup ------------------------------

create or replace function public.submit_public_organizer_response_with_signup(
  p_token uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_answers jsonb,
  p_auth_user_id uuid
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
  v_response_id uuid;
  v_answer jsonb;
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
  perform public.link_public_portal_account(v_workspace_id, v_client_id, p_auth_user_id, p_email, btrim(coalesce(p_first_name,'') || ' ' || coalesce(p_last_name,'')));

  return jsonb_build_object('ok', true, 'client_id', v_client_id, 'response_id', v_response_id);
end;
$function$;

grant execute on function public.submit_public_organizer_response_with_signup(uuid, text, text, text, text, jsonb, uuid) to anon, authenticated;

-- requires_portal_signup added to the existing template-fetch payload; the
-- rest of the function is byte-for-byte identical to the live definition.
create or replace function public.get_public_organizer_template(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_template record;
  v_result jsonb;
begin
  select ot.id, ot.name, ot.description, ot.workspace_id, ot.requires_portal_signup, w.name as workspace_name
  into v_template
  from public.organizer_templates ot
  join public.workspaces w on w.id = ot.workspace_id
  where ot.public_token = p_token and ot.is_public = true and ot.status = 'published';

  if v_template.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'template', jsonb_build_object('id', v_template.id, 'name', v_template.name, 'description', v_template.description),
    'workspace_name', v_template.workspace_name,
    'requires_portal_signup', v_template.requires_portal_signup,
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'field_type', f.field_type, 'label', f.label, 'help_text', f.help_text,
        'display_order', f.display_order, 'is_required', f.is_required, 'options', f.options,
        'parent_field_id', f.parent_field_id, 'conditional_logic', f.conditional_logic
      ) order by f.display_order)
      from public.organizer_fields f
      where f.organizer_template_id = v_template.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

-- Engagement letter public signing with inline signup ---------------------

create or replace function public.sign_public_engagement_letter_with_signup(
  p_token uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_typed_name text,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_template record;
  v_client_id uuid;
  v_client_name text;
  v_resolved_html text;
  v_signature_id uuid;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;
  if p_typed_name is null or btrim(p_typed_name) = '' then
    raise exception 'A typed signature is required';
  end if;
  if p_auth_user_id is null then
    raise exception 'A portal account is required for this link';
  end if;

  select elt.id, elt.workspace_id, elt.body_html, elt.requires_portal_signup,
         w.name as firm_name, w.mailing_address as firm_address, w.phone as firm_phone
  into v_template
  from public.engagement_letter_templates elt
  join public.workspaces w on w.id = elt.workspace_id
  where elt.public_token = p_token and elt.is_public = true and elt.status = 'published';

  if v_template.id is null then
    raise exception 'This link is no longer available';
  end if;
  if not v_template.requires_portal_signup then
    raise exception 'This engagement letter does not use portal signup';
  end if;

  v_client_id := public.find_or_create_public_lead(v_template.workspace_id, p_first_name, p_last_name, p_email, p_phone);
  v_client_name := btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));
  v_resolved_html := public.render_engagement_letter_merge_fields(v_template.body_html, v_client_name, v_template.firm_name, v_template.firm_address, v_template.firm_phone);

  insert into public.engagement_letter_public_signatures (
    workspace_id, engagement_letter_template_id, client_id,
    signer_name, signer_email, signer_phone, resolved_body_html, typed_name
  ) values (
    v_template.workspace_id, v_template.id, v_client_id,
    v_client_name, btrim(p_email), nullif(btrim(coalesce(p_phone, '')), ''), v_resolved_html, btrim(p_typed_name)
  )
  returning id into v_signature_id;

  perform public.link_public_portal_account(v_template.workspace_id, v_client_id, p_auth_user_id, p_email, v_client_name);

  return jsonb_build_object('ok', true, 'signature_id', v_signature_id);
end;
$function$;

grant execute on function public.sign_public_engagement_letter_with_signup(uuid, text, text, text, text, text, uuid) to anon, authenticated;

-- requires_portal_signup added to the existing template-fetch payload; the
-- rest of the function is byte-for-byte identical to the live definition.
create or replace function public.get_public_engagement_letter_template(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row record;
begin
  select elt.id, elt.name, elt.body_html, elt.requires_signature, elt.requires_portal_signup, w.name as workspace_name,
         w.name as firm_name, w.mailing_address as firm_address, w.phone as firm_phone
  into v_row
  from public.engagement_letter_templates elt
  join public.workspaces w on w.id = elt.workspace_id
  where elt.public_token = p_token and elt.is_public = true and elt.status = 'published';

  if v_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'template', jsonb_build_object('id', v_row.id, 'name', v_row.name, 'body_html', v_row.body_html, 'requires_signature', v_row.requires_signature),
    'workspace_name', v_row.workspace_name,
    'firm_name', v_row.firm_name,
    'firm_address', v_row.firm_address,
    'firm_phone', v_row.firm_phone,
    'requires_portal_signup', v_row.requires_portal_signup
  );
end;
$function$;
