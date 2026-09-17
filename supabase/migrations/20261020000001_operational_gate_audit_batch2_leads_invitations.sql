-- P1: workspace-operational-gate audit -- batch 2 (public lead-capture chokepoint,
-- public organizer submission, quote acceptance, workspace invitations).
--
-- find_or_create_public_lead is the single shared chokepoint for every public,
-- anon-reachable lead-capture entry point (capture_public_lead_from_site_page,
-- capture_public_lead_from_contact_step, sign_public_engagement_letter(+_with_signup),
-- and the new-lead branch of submit_public_organizer_response(+_with_signup)) --
-- gating it here closes all of those in one place. submit_public_organizer_response
-- (+_with_signup) also gets its own explicit check because they can be called
-- with an EXISTING p_client_id, which skips find_or_create_public_lead entirely.

create or replace function public.find_or_create_public_lead(p_workspace_id uuid, p_first_name text, p_last_name text, p_email text, p_phone text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_normalized_email citext;
  v_normalized_phone text;
  v_client_id uuid;
begin
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  v_normalized_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_normalized_phone := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');

  select id into v_client_id
  from public.clients
  where workspace_id = p_workspace_id
    and merged_into_client_id is null
    and (
      (v_normalized_email is not null and normalized_email = v_normalized_email)
      or (v_normalized_phone is not null and normalized_phone = v_normalized_phone)
    )
  limit 1;

  if v_client_id is not null then
    return v_client_id;
  end if;

  insert into public.clients (workspace_id, client_type, lifecycle_status, first_name, last_name, primary_email, primary_phone, normalized_email, normalized_phone)
  values (
    p_workspace_id, 'individual', 'lead',
    nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''),
    nullif(btrim(coalesce(p_email, '')), ''), nullif(btrim(coalesce(p_phone, '')), ''),
    v_normalized_email, v_normalized_phone
  )
  returning id into v_client_id;

  return v_client_id;
end;
$function$;

create or replace function public.submit_public_organizer_response(p_token uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_answers jsonb, p_client_id uuid default null::uuid)
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
  v_field record;
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
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if p_client_id is not null and not exists (
    select 1 from public.clients where id = p_client_id and workspace_id = v_workspace_id
  ) then
    raise exception 'invalid client for this organizer link';
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

  for v_field in
    select f.id, f.client_profile_field
    from public.organizer_fields f
    where f.organizer_template_id = v_template_id and f.client_profile_field is not null and f.parent_field_id is null
  loop
    perform public._propose_client_field_from_organizer_answer(
      v_workspace_id, v_client_id, v_response_id, v_field.id, v_field.client_profile_field,
      (select a.value from public.organizer_response_answers a where a.organizer_response_id = v_response_id and a.organizer_field_id = v_field.id and a.instance_index = 0)
    );
  end loop;

  perform public.resolve_organizer_response_service(v_response_id);
  v_signature_request_id := public.resolve_and_sign_organizer_response(v_response_id, v_workspace_id, v_template_id, v_client_name, p_email);

  return jsonb_build_object('ok', true, 'client_id', v_client_id, 'response_id', v_response_id, 'signature_request_id', v_signature_request_id);
end;
$function$;

create or replace function public.submit_public_organizer_response_with_signup(p_token uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_answers jsonb, p_auth_user_id uuid, p_client_id uuid default null::uuid)
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
  v_field record;
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
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if not v_requires_signup then
    raise exception 'This organizer does not use portal signup';
  end if;

  if p_client_id is not null and not exists (
    select 1 from public.clients where id = p_client_id and workspace_id = v_workspace_id
  ) then
    raise exception 'invalid client for this organizer link';
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

  for v_field in
    select f.id, f.client_profile_field
    from public.organizer_fields f
    where f.organizer_template_id = v_template_id and f.client_profile_field is not null and f.parent_field_id is null
  loop
    perform public._propose_client_field_from_organizer_answer(
      v_workspace_id, v_client_id, v_response_id, v_field.id, v_field.client_profile_field,
      (select a.value from public.organizer_response_answers a where a.organizer_response_id = v_response_id and a.organizer_field_id = v_field.id and a.instance_index = 0)
    );
  end loop;

  v_signature_request_id := public.resolve_and_sign_organizer_response(v_response_id, v_workspace_id, v_template_id, v_client_name, p_email);

  return jsonb_build_object('ok', true, 'client_id', v_client_id, 'response_id', v_response_id, 'signature_request_id', v_signature_request_id);
end;
$function$;

create or replace function public.accept_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quote public.quotes;
  v_service record;
  v_category_slug text;
  v_case_type text;
  v_engagement_id uuid;
  v_invoice_id uuid;
begin
  select * into v_quote from public.quotes where id = p_quote_id;
  if v_quote.id is null then
    raise exception 'quote not found';
  end if;
  if not public.is_portal_user(v_quote.client_id) then
    raise exception 'not authorized to respond to this quote';
  end if;
  if not public.is_workspace_operational(v_quote.workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'this quote is no longer awaiting a response';
  end if;

  update public.quotes set status = 'accepted', accepted_at = now() where id = p_quote_id;

  v_engagement_id := v_quote.engagement_id;

  if v_engagement_id is null and v_quote.service_id is not null then
    select id, process_id into v_service
    from public.services
    where id = v_quote.service_id and (workspace_id is null or workspace_id = v_quote.workspace_id);

    if v_service.id is not null then
      select sc.slug into v_category_slug
      from public.services s
      join public.service_categories sc on sc.id = s.service_category_id
      where s.id = v_service.id;

      v_case_type := case v_category_slug
        when 'tax-preparation' then 'tax_return'
        when 'bookkeeping' then 'bookkeeping'
        when 'payroll' then 'payroll'
        when 'business-services' then 'business_service'
        else 'other'
      end;

      insert into public.engagements (workspace_id, client_id, service_id, workflow_id, case_type)
      values (v_quote.workspace_id, v_quote.client_id, v_service.id, v_service.process_id, v_case_type)
      returning id into v_engagement_id;

      if v_service.process_id is not null then
        perform public.start_pipeline_run('engagement', v_engagement_id, v_service.process_id);
      end if;

      update public.quotes set engagement_id = v_engagement_id where id = p_quote_id;
    end if;
  end if;

  insert into public.invoices (workspace_id, client_id, engagement_id, status, line_items, subtotal, discount_amount, tax_amount, total_amount, notes)
  values (v_quote.workspace_id, v_quote.client_id, v_engagement_id, 'sent', v_quote.line_items, v_quote.subtotal, v_quote.discount_amount, v_quote.tax_amount, v_quote.total_amount, v_quote.notes)
  returning id into v_invoice_id;

  update public.quotes set invoice_id = v_invoice_id where id = p_quote_id;

  perform public._notify_admins_of_quote_response(v_quote.workspace_id, v_quote.client_id, p_quote_id, 'accepted');
end;
$function$;

create or replace function public.create_workspace_invitation(p_workspace_id uuid, p_email text, p_role_id uuid)
returns workspace_invitations
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.workspace_invitations;
  v_workspace_type text;
  v_capacity integer;
  v_in_use integer;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to invite members to this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id and (workspace_id is null or workspace_id = p_workspace_id)) then
    raise exception 'role does not belong to this workspace';
  end if;

  select workspace_type into v_workspace_type from public.workspaces where id = p_workspace_id;
  v_capacity := public.get_included_seats(v_workspace_type)
    + (select count(*) from public.workspace_paid_seats where workspace_id = p_workspace_id and status = 'active');
  v_in_use := (select count(*) from public.workspace_users where workspace_id = p_workspace_id and status = 'active')
    + (select count(*) from public.workspace_invitations where workspace_id = p_workspace_id and status = 'pending' and lower(email) <> lower(p_email));

  if v_in_use >= v_capacity then
    raise exception 'no available staff seats -- purchase an additional seat before inviting another team member';
  end if;

  insert into public.workspace_invitations (workspace_id, email, role_id, invited_by)
  values (p_workspace_id, lower(p_email), p_role_id, auth.uid())
  on conflict (workspace_id, lower(email)) where status = 'pending'
  do update set role_id = excluded.role_id, invited_by = excluded.invited_by,
    token = gen_random_uuid(), expires_at = now() + interval '7 days', updated_at = now()
  returning * into v_row;

  return v_row;
end;
$function$;

create or replace function public.accept_workspace_invitation_by_token(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_invitation public.workspace_invitations;
  v_user_email text;
  v_workspace_type text;
  v_capacity integer;
  v_in_use integer;
begin
  select * into v_invitation from public.workspace_invitations where token = p_token;

  if v_invitation.id is null then
    raise exception 'invitation not found';
  end if;
  if not public.is_workspace_operational(v_invitation.workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception 'invitation is no longer pending';
  end if;
  if v_invitation.expires_at < now() then
    update public.workspace_invitations set status = 'expired', updated_at = now() where id = v_invitation.id;
    raise exception 'invitation has expired';
  end if;

  select email into v_user_email from auth.users where id = auth.uid();
  if v_user_email is null or lower(v_user_email) <> lower(v_invitation.email) then
    raise exception 'this invitation was sent to a different email address';
  end if;

  perform 1 from public.workspace_subscriptions where workspace_id = v_invitation.workspace_id for update;

  select workspace_type into v_workspace_type from public.workspaces where id = v_invitation.workspace_id;
  v_capacity := public.get_included_seats(v_workspace_type)
    + (select count(*) from public.workspace_paid_seats where workspace_id = v_invitation.workspace_id and status = 'active');
  v_in_use := (select count(*) from public.workspace_users where workspace_id = v_invitation.workspace_id and status = 'active' and user_id <> auth.uid());

  if v_in_use >= v_capacity then
    raise exception 'this workspace has no available staff seats right now -- ask an admin to purchase another seat before accepting';
  end if;

  insert into public.workspace_users (workspace_id, user_id, role_id, status, invited_by, invited_at, joined_at)
  values (v_invitation.workspace_id, auth.uid(), v_invitation.role_id, 'active', v_invitation.invited_by, v_invitation.created_at, now())
  on conflict (workspace_id, user_id) do update
    set role_id = excluded.role_id, status = 'active', joined_at = now();

  if v_invitation.grant_platform_it then
    update public.user_profiles set is_platform_it = true, updated_at = now() where id = auth.uid();
  end if;

  update public.workspace_invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now(), updated_at = now()
  where id = v_invitation.id;

  return v_invitation.workspace_id;
end;
$function$;

-- Legacy path (no current app call site, but directly reachable via
-- PostgREST by any authenticated user) -- smallest fix is to fold the
-- operational check straight into the existing WHERE clause.
create or replace function public.accept_workspace_invitation(p_workspace_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.workspace_users
  set status = 'active', joined_at = now()
  where workspace_id = p_workspace_id and user_id = auth.uid() and status = 'invited'
    and public.is_workspace_operational(p_workspace_id);
$function$;

create or replace function public.invite_workspace_user(p_workspace_id uuid, p_user_id uuid, p_role_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to invite members to this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id and (workspace_id is null or workspace_id = p_workspace_id)) then
    raise exception 'role does not belong to this workspace';
  end if;

  insert into public.workspace_users (workspace_id, user_id, role_id, status, invited_by, invited_at)
  values (p_workspace_id, p_user_id, p_role_id, 'invited', auth.uid(), now())
  on conflict (workspace_id, user_id) do update
    set role_id = excluded.role_id, status = 'invited', invited_by = excluded.invited_by, invited_at = now()
  returning id into v_id;

  insert into public.notification_queue (workspace_id, recipient_user_id, channel, template_key, payload)
  values (p_workspace_id, p_user_id, 'Portal', 'workspace_invitation',
    jsonb_build_object('workspace_id', p_workspace_id, 'invited_by', auth.uid()));

  return v_id;
end;
$function$;
