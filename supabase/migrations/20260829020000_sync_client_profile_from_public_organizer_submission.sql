-- The authenticated portal organizer flow (components/portal/OrganizerForm.tsx)
-- already proposes client_profile_field-mapped answers back to the client
-- record -- applied immediately if the field is empty, otherwise queued in
-- client_pending_changes for staff review (propose_client_full_name,
-- propose_client_mailing_address, propose_client_date_of_birth,
-- propose_client_sensitive_field, propose_client_contact_field). But those
-- five RPCs all hard-require an authenticated portal identity
-- (client_portal_users keyed on auth.uid()) and raise "no active portal
-- identity for this user" otherwise -- so neither public submission path
-- (submit_public_organizer_response, submit_public_organizer_response_with_
-- signup) could ever call them. Confirmed live: a full test submission with
-- a name, SSN, DOB, email, phone, and mailing address answered left the
-- client record completely untouched and created zero client_pending_changes
-- rows. Since a public link is the primary way a brand-new prospect fills
-- out an intake organizer (before they ever have portal access), this meant
-- none of that information ever reached the client record -- staff had to
-- retype everything by hand from the resolved document.
--
-- Fixed by extracting the shared decide/apply-or-queue logic each of the
-- five propose_client_* functions already contains into one new internal
-- function that takes client_id/workspace_id explicitly instead of deriving
-- them from auth.uid(), then having both the (unchanged, still portal-only)
-- five wrappers AND the two public submission functions call it. This keeps
-- every existing call site (the portal frontend, exact same RPC names/
-- signatures) working identically while adding the missing public path.

create or replace function public._propose_client_field_from_organizer_answer(
  p_workspace_id uuid,
  p_client_id uuid,
  p_organizer_response_id uuid,
  p_organizer_field_id uuid,
  p_client_profile_field text,
  p_value jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_source text := 'organizer';
  v_batch uuid := gen_random_uuid();
  v_decision text;
  v_any_queued boolean := false;
  v_obj jsonb;
  v_text text;
  v_date date;
  v_address_id uuid;
  v_cur_street text;
  v_cur_city text;
  v_cur_state text;
  v_cur_zip text;
  v_cur_first text;
  v_cur_middle text;
  v_cur_last text;
  v_cur_suffix text;
  v_current text;
  v_stored_value text;
  v_last4 text;
  v_old_last4 text;
begin
  if p_value is null then
    return;
  end if;

  if p_client_profile_field = 'full_name' then
    v_obj := p_value;
    if jsonb_typeof(v_obj) = 'string' then
      begin
        v_obj := (v_obj #>> '{}')::jsonb;
      exception when others then
        v_obj := jsonb_build_object('first', p_value #>> '{}');
      end;
    end if;
    if jsonb_typeof(v_obj) <> 'object' then
      return;
    end if;

    select first_name, middle_name, last_name, suffix into v_cur_first, v_cur_middle, v_cur_last, v_cur_suffix
    from public.clients where id = p_client_id;

    v_decision := public._decide_client_field_change(p_workspace_id, p_client_id, 'clients', 'first_name', null, v_cur_first, v_obj->>'first', v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null);
    if v_decision = 'applied' then update public.clients set first_name = v_obj->>'first', updated_at = now() where id = p_client_id; end if;
    if v_decision = 'queued' then v_any_queued := true; end if;

    v_decision := public._decide_client_field_change(p_workspace_id, p_client_id, 'clients', 'middle_name', null, v_cur_middle, v_obj->>'middle', v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null);
    if v_decision = 'applied' then update public.clients set middle_name = v_obj->>'middle', updated_at = now() where id = p_client_id; end if;
    if v_decision = 'queued' then v_any_queued := true; end if;

    v_decision := public._decide_client_field_change(p_workspace_id, p_client_id, 'clients', 'last_name', null, v_cur_last, v_obj->>'last', v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null);
    if v_decision = 'applied' then update public.clients set last_name = v_obj->>'last', updated_at = now() where id = p_client_id; end if;
    if v_decision = 'queued' then v_any_queued := true; end if;

    v_decision := public._decide_client_field_change(p_workspace_id, p_client_id, 'clients', 'suffix', null, v_cur_suffix, v_obj->>'suffix', v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null);
    if v_decision = 'applied' then update public.clients set suffix = v_obj->>'suffix', updated_at = now() where id = p_client_id; end if;
    if v_decision = 'queued' then v_any_queued := true; end if;

    if v_any_queued then
      perform public._notify_admins_of_pending_client_change(p_workspace_id, p_client_id, v_batch);
    end if;

  elsif p_client_profile_field = 'mailing_address' then
    v_obj := p_value;
    if jsonb_typeof(v_obj) = 'string' then
      begin
        v_obj := (v_obj #>> '{}')::jsonb;
      exception when others then
        v_obj := null;
      end;
    end if;
    if v_obj is null or jsonb_typeof(v_obj) <> 'object' then
      return;
    end if;

    select id, street, city, state, zip into v_address_id, v_cur_street, v_cur_city, v_cur_state, v_cur_zip
    from public.client_addresses
    where client_id = p_client_id and address_type = 'mailing'
    order by is_primary desc, created_at asc
    limit 1;

    if v_address_id is null then
      insert into public.client_addresses (client_id, workspace_id, address_type, is_primary, display_order)
      values (p_client_id, p_workspace_id, 'mailing', true, 0)
      returning id into v_address_id;
      v_cur_street := null;
      v_cur_city := null;
      v_cur_state := null;
      v_cur_zip := null;
    end if;

    v_decision := public._decide_client_field_change(p_workspace_id, p_client_id, 'client_addresses', 'street', v_address_id, v_cur_street, v_obj->>'street', v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null);
    if v_decision = 'applied' then update public.client_addresses set street = v_obj->>'street', updated_at = now() where id = v_address_id; end if;
    if v_decision = 'queued' then v_any_queued := true; end if;

    v_decision := public._decide_client_field_change(p_workspace_id, p_client_id, 'client_addresses', 'city', v_address_id, v_cur_city, v_obj->>'city', v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null);
    if v_decision = 'applied' then update public.client_addresses set city = v_obj->>'city', updated_at = now() where id = v_address_id; end if;
    if v_decision = 'queued' then v_any_queued := true; end if;

    v_decision := public._decide_client_field_change(p_workspace_id, p_client_id, 'client_addresses', 'state', v_address_id, v_cur_state, v_obj->>'state', v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null);
    if v_decision = 'applied' then update public.client_addresses set state = v_obj->>'state', updated_at = now() where id = v_address_id; end if;
    if v_decision = 'queued' then v_any_queued := true; end if;

    v_decision := public._decide_client_field_change(p_workspace_id, p_client_id, 'client_addresses', 'zip', v_address_id, v_cur_zip, v_obj->>'zip', v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null);
    if v_decision = 'applied' then update public.client_addresses set zip = v_obj->>'zip', updated_at = now() where id = v_address_id; end if;
    if v_decision = 'queued' then v_any_queued := true; end if;

    if v_any_queued then
      perform public._notify_admins_of_pending_client_change(p_workspace_id, p_client_id, v_batch);
    end if;

  elsif p_client_profile_field = 'date_of_birth' then
    v_text := coalesce(p_value #>> '{}', '');
    if btrim(v_text) = '' then
      return;
    end if;
    begin
      v_date := v_text::date;
    exception when others then
      return;
    end;

    select date_of_birth::text into v_current from public.clients where id = p_client_id;

    v_decision := public._decide_client_field_change(p_workspace_id, p_client_id, 'clients', 'date_of_birth', null, v_current, v_date::text, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null);
    if v_decision = 'applied' then
      update public.clients set date_of_birth = v_date, updated_at = now() where id = p_client_id;
    elsif v_decision = 'queued' then
      perform public._notify_admins_of_pending_client_change(p_workspace_id, p_client_id, v_batch);
    end if;

  elsif p_client_profile_field = 'ssn' then
    v_text := coalesce(p_value #>> '{}', '');
    if btrim(v_text) = '' then
      return;
    end if;

    v_stored_value := encode(public.encrypt_client_secret(v_text), 'base64');
    v_last4 := nullif(right(regexp_replace(v_text, '\D', '', 'g'), 4), '');
    select ssn_last4 into v_old_last4 from public.clients where id = p_client_id;

    insert into public.client_pending_changes (
      workspace_id, client_id, source, organizer_response_id, organizer_field_id,
      target_table, target_column, old_value, new_value, new_value_last4, batch_id, submitted_by_portal_user_id
    ) values (
      p_workspace_id, p_client_id, v_source, p_organizer_response_id, p_organizer_field_id,
      'clients', 'ssn', v_old_last4, v_stored_value, v_last4, v_batch, null
    )
    on conflict (client_id, target_table, target_column, coalesce(client_address_id, '00000000-0000-0000-0000-000000000000'))
      where status = 'pending'
      do update set new_value = excluded.new_value, new_value_last4 = excluded.new_value_last4, old_value = excluded.old_value, batch_id = excluded.batch_id, created_at = now();

    perform public._notify_admins_of_pending_client_change(p_workspace_id, p_client_id, v_batch);

  elsif p_client_profile_field in ('first_name', 'last_name', 'business_name', 'primary_email', 'primary_phone') then
    v_text := p_value #>> '{}';
    if v_text is null or btrim(v_text) = '' then
      return;
    end if;

    execute format('select %I from public.clients where id = $1', p_client_profile_field) into v_current using p_client_id;

    v_decision := public._decide_client_field_change(
      p_workspace_id, p_client_id, 'clients', p_client_profile_field, null, v_current, v_text,
      v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null
    );

    if v_decision = 'applied' then
      execute format('update public.clients set %I = $1, updated_at = now() where id = $2', p_client_profile_field) using v_text, p_client_id;
    elsif v_decision = 'queued' then
      perform public._notify_admins_of_pending_client_change(p_workspace_id, p_client_id, v_batch);
    end if;
  end if;
end;
$function$;

-- Both public submission functions call the new shared logic for every
-- client_profile_field-mapped top-level answer, right after the answers are
-- inserted -- mirroring exactly when the portal flow's saveAll() does it
-- (repeater children are never mapped there either, so this only considers
-- top-level fields, same as the portal path).

create or replace function public.submit_public_organizer_response(p_token uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_answers jsonb, p_client_id uuid DEFAULT NULL::uuid)
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

create or replace function public.submit_public_organizer_response_with_signup(p_token uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_answers jsonb, p_auth_user_id uuid, p_client_id uuid DEFAULT NULL::uuid)
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
