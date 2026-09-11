-- Pre-existing bug found while live-testing the new public-organizer client
-- sync (previous migration): trg_guard_client_sensitive_fields (BEFORE
-- UPDATE on clients) blocks any write to date_of_birth/ssn*/ein*/itin*
-- unless the CALLER has staff permission 'clients.edit_sensitive' via
-- has_permission(), which checks workspace_users membership. But
-- propose_client_date_of_birth (the existing, portal-facing propose-on-
-- change RPC) is called by real *client portal users* -- who are never
-- workspace_users and so never have that permission -- whenever a portal
-- client's date_of_birth field is empty and they answer the DOB question in
-- an organizer for the first time, its "applied" branch's direct UPDATE has
-- always hit this guard and raised "insufficient permissions to edit
-- sensitive client fields", surfaced to the client as a save error. This
-- predates today's changes entirely; it just hadn't been exercised by a
-- clean empty-DOB test until now. (ssn never hit this because
-- propose_client_sensitive_field always queues it through
-- client_pending_changes rather than updating clients directly.)
--
-- Fixed with a transaction-local bypass flag: the guard now also allows the
-- write when app.bypass_sensitive_field_guard is set for the current
-- transaction, which propose_client_date_of_birth and the new
-- _propose_client_field_from_organizer_answer set immediately before their
-- date_of_birth UPDATE (set_config with is_local=true, so it can never leak
-- past the current transaction). The staff-facing permission check is
-- unchanged for every other caller -- this only unblocks the one specific,
-- already-vetted-by-_decide_client_field_change system pathway that was
-- always meant to be allowed.

create or replace function public.guard_client_sensitive_fields()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (
    new.date_of_birth is distinct from old.date_of_birth
    or new.ssn_encrypted is distinct from old.ssn_encrypted
    or new.ssn_hash is distinct from old.ssn_hash
    or new.ssn_last4 is distinct from old.ssn_last4
    or new.ein_encrypted is distinct from old.ein_encrypted
    or new.ein_hash is distinct from old.ein_hash
    or new.ein_last4 is distinct from old.ein_last4
    or new.itin_encrypted is distinct from old.itin_encrypted
    or new.itin_hash is distinct from old.itin_hash
    or new.itin_last4 is distinct from old.itin_last4
  )
    and not has_permission(new.workspace_id, 'clients.edit_sensitive')
    and coalesce(current_setting('app.bypass_sensitive_field_guard', true), 'off') <> 'on'
  then
    raise exception 'insufficient permissions to edit sensitive client fields (date of birth, SSN, EIN, ITIN)';
  end if;
  return new;
end;
$function$;

create or replace function public.propose_client_date_of_birth(p_new_value date, p_organizer_response_id uuid DEFAULT NULL::uuid, p_organizer_field_id uuid DEFAULT NULL::uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_portal_user_id uuid;
  v_client_id uuid;
  v_workspace_id uuid;
  v_current date;
  v_decision text;
  v_batch uuid := gen_random_uuid();
  v_source text := case when p_organizer_field_id is not null then 'organizer' else 'basic_info' end;
begin
  select cpu.id, cpu.client_id, cpu.workspace_id into v_portal_user_id, v_client_id, v_workspace_id
  from public.client_portal_users cpu where cpu.user_id = auth.uid() and cpu.status = 'active' limit 1;
  if v_client_id is null then
    raise exception 'no active portal identity for this user';
  end if;

  select date_of_birth into v_current from public.clients where id = v_client_id;

  v_decision := public._decide_client_field_change(
    v_workspace_id, v_client_id, 'clients', 'date_of_birth', null, v_current::text, p_new_value::text,
    v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id
  );

  if v_decision = 'applied' then
    perform set_config('app.bypass_sensitive_field_guard', 'on', true);
    update public.clients set date_of_birth = p_new_value, updated_at = now() where id = v_client_id;
  elsif v_decision = 'queued' then
    perform public._notify_admins_of_pending_client_change(v_workspace_id, v_client_id, v_batch);
  end if;
end;
$function$;

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
      perform set_config('app.bypass_sensitive_field_guard', 'on', true);
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
