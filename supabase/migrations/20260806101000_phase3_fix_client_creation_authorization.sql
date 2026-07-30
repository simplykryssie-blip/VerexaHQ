-- Root cause of "save_workspace_client ... Not allowed to save clients for
-- this workspace" (P0001) for Account Owners: save_workspace_client gated
-- ALL client writes behind can_staff_write() -> workspace_allows_business_
-- writes(), which only permits writes when workspaces.account_status =
-- 'active'. Every newly created workspace defaults to account_status =
-- 'setup_incomplete' (until firm onboarding is separately marked complete),
-- so any Owner who hadn't finished the onboarding checklist -- including
-- every Trial/beta workspace, where "no card required, full functionality"
-- is the explicit product model -- was unconditionally blocked from adding
-- their first client. This treated "onboarding checklist not finished" the
-- same as an explicit suspension, which contradicts the intended behavior:
-- the Owner must always be able to create clients unless the workspace is
-- explicitly suspended (or similarly hard-blocked: payment_blocked,
-- read_only, archived, canceled).
--
-- The fix does not touch workspace_allows_business_writes/can_staff_write
-- (left exactly as-is for every other caller) and does not touch
-- refresh_workspace_account_status/set_workspace_account_status (both
-- intentionally service_role/platform-admin-only -- relaxing those would
-- let a workspace member flip their own suspension/archival state, which
-- would be a real security weakening). Instead it fixes the specific,
-- overly-coarse rule this RPC was using: platform_account_status_rules
-- already exists as the sanctioned, fine-grained per-status permission
-- table (already surfaced to the frontend via get_workspace_access_state),
-- but its setup_incomplete row denied allow_create_clients/allow_edit_
-- clients, and save_workspace_client never consulted this table at all --
-- it only ever checked the coarse account_status='active' gate.
update public.platform_account_status_rules
set allow_create_clients = true,
    allow_edit_clients = true,
    updated_at = now()
where status_code = 'setup_incomplete';

create or replace function public.workspace_member_has_staff_role(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    exists (
      select 1 from public.workspaces w
      where w.id = p_workspace_id and w.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = p_workspace_id
        and wm.user_id = auth.uid()
        and lower(coalesce(wm.member_status, 'active')) in ('active','accepted')
        and lower(coalesce(wm.role, '')) in (
          'owner','administrator','admin','manager','staff','preparer',
          'senior preparer','tax preparer','reviewer','senior reviewer',
          'tax reviewer','ero','bookkeeper','payroll'
        )
    )
    or public.is_platform_admin();
$$;

revoke execute on function public.workspace_member_has_staff_role(uuid) from public;
revoke execute on function public.workspace_member_has_staff_role(uuid) from anon;
grant execute on function public.workspace_member_has_staff_role(uuid) to authenticated;

create or replace function public.workspace_can_create_clients(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_platform_admin()
    or (
      public.workspace_member_has_staff_role(p_workspace_id)
      and coalesce((
        select r.allow_create_clients
        from public.workspaces w
        join public.platform_account_status_rules r
          on r.status_code = w.account_status and r.is_active = true
        where w.id = p_workspace_id
      ), false)
    );
$$;

revoke execute on function public.workspace_can_create_clients(uuid) from public;
revoke execute on function public.workspace_can_create_clients(uuid) from anon;
grant execute on function public.workspace_can_create_clients(uuid) to authenticated;

create or replace function public.workspace_can_edit_clients(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_platform_admin()
    or (
      public.workspace_member_has_staff_role(p_workspace_id)
      and coalesce((
        select r.allow_edit_clients
        from public.workspaces w
        join public.platform_account_status_rules r
          on r.status_code = w.account_status and r.is_active = true
        where w.id = p_workspace_id
      ), false)
    );
$$;

revoke execute on function public.workspace_can_edit_clients(uuid) from public;
revoke execute on function public.workspace_can_edit_clients(uuid) from anon;
grant execute on function public.workspace_can_edit_clients(uuid) to authenticated;

create or replace function public.save_workspace_client(p_workspace_id uuid, p_client_id uuid DEFAULT NULL::uuid, p_client_type text DEFAULT 'individual'::text, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text, p_business_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_zip_code text DEFAULT NULL::text, p_status text DEFAULT 'lead'::text, p_source text DEFAULT NULL::text, p_service_types text[] DEFAULT ARRAY[]::text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_client_id uuid;
  v_errors text[] := array[]::text[];
  v_is_update boolean := p_client_id is not null;
  v_client_count_state jsonb;
  v_status text := coalesce(nullif(trim(coalesce(p_status,'')), ''), 'lead');
  v_source text := nullif(trim(coalesce(p_source,'')), '');
  v_service text;
  v_clean_services text[] := array[]::text[];
  v_status_reason text;
begin
  if v_is_update then
    if not public.workspace_can_edit_clients(p_workspace_id) then
      select account_status_reason into v_status_reason from public.workspaces where id = p_workspace_id;
      raise exception 'This workspace cannot edit clients right now.%', coalesce(' ' || v_status_reason, '');
    end if;
  else
    if not public.workspace_can_create_clients(p_workspace_id) then
      select account_status_reason into v_status_reason from public.workspaces where id = p_workspace_id;
      raise exception 'This workspace cannot add new clients right now.%', coalesce(' ' || v_status_reason, '');
    end if;
  end if;

  if p_client_type not in ('individual','business') then
    v_errors := array_append(v_errors, 'Client type must be Individual or Business.');
  end if;

  if v_status not in ('lead','active','inactive','archived') then
    v_errors := array_append(v_errors, 'Client status must be selected from the dropdown.');
  end if;

  if v_source is not null and not exists (
    select 1 from public.client_setup_options where option_group = 'client_source' and option_code = v_source and is_active = true
  ) then
    v_errors := array_append(v_errors, 'Client source must be selected from the dropdown.');
  end if;

  foreach v_service in array coalesce(p_service_types, array[]::text[]) loop
    v_service := nullif(trim(v_service), '');
    if v_service is not null then
      if not exists (
        select 1 from public.client_setup_options where option_group = 'client_service_type' and option_code = v_service and is_active = true
      ) then
        v_errors := array_append(v_errors, 'Selected service type is invalid: ' || v_service);
      else
        v_clean_services := array_append(v_clean_services, v_service);
      end if;
    end if;
  end loop;

  if array_length(v_clean_services, 1) is null then
    v_errors := array_append(v_errors, 'At least one service must be selected.');
  end if;

  if p_client_type = 'business' and nullif(trim(coalesce(p_business_name,'')), '') is null then
    v_errors := array_append(v_errors, 'Business name is required for business clients.');
  end if;

  if p_client_type = 'individual' and nullif(trim(coalesce(p_first_name,'')), '') is null and nullif(trim(coalesce(p_last_name,'')), '') is null then
    v_errors := array_append(v_errors, 'First name or last name is required.');
  end if;

  if nullif(trim(coalesce(p_email,'')), '') is null and nullif(trim(coalesce(p_phone,'')), '') is null then
    v_errors := array_append(v_errors, 'Email or phone is required.');
  end if;

  if array_length(v_errors, 1) is not null then
    raise exception 'Client cannot be saved: %', array_to_string(v_errors, ' ');
  end if;

  if not v_is_update then
    v_client_count_state := public.workspace_usage_limit_state(p_workspace_id, 'clients');
    if coalesce((v_client_count_state->>'allowed')::boolean, true) = false then
      raise exception 'Client limit reached. Upgrade plan or add a client block before adding more clients.';
    end if;
  end if;

  if v_is_update then
    update public.clients
    set client_type = p_client_type,
        first_name = nullif(trim(coalesce(p_first_name,'')), ''),
        last_name = nullif(trim(coalesce(p_last_name,'')), ''),
        business_name = nullif(trim(coalesce(p_business_name,'')), ''),
        email = nullif(trim(coalesce(p_email,'')), ''),
        phone = nullif(trim(coalesce(p_phone,'')), ''),
        address = nullif(trim(coalesce(p_address,'')), ''),
        city = nullif(trim(coalesce(p_city,'')), ''),
        state = nullif(trim(coalesce(p_state,'')), ''),
        zip_code = nullif(trim(coalesce(p_zip_code,'')), ''),
        status = v_status,
        source = v_source,
        updated_at = now()
    where id = p_client_id and workspace_id = p_workspace_id
    returning id into v_client_id;

    if v_client_id is null then raise exception 'Client not found'; end if;

    delete from public.client_service_interests where client_id = v_client_id;
  else
    insert into public.clients (
      workspace_id, client_type, first_name, last_name, business_name, email, phone,
      address, city, state, zip_code, status, source, assigned_to
    ) values (
      p_workspace_id, p_client_type, nullif(trim(coalesce(p_first_name,'')), ''), nullif(trim(coalesce(p_last_name,'')), ''),
      nullif(trim(coalesce(p_business_name,'')), ''), nullif(trim(coalesce(p_email,'')), ''), nullif(trim(coalesce(p_phone,'')), ''),
      nullif(trim(coalesce(p_address,'')), ''), nullif(trim(coalesce(p_city,'')), ''), nullif(trim(coalesce(p_state,'')), ''),
      nullif(trim(coalesce(p_zip_code,'')), ''), v_status, v_source, auth.uid()
    ) returning id into v_client_id;
  end if;

  foreach v_service in array v_clean_services loop
    insert into public.client_service_interests (workspace_id, client_id, service_type, service_status)
    values (p_workspace_id, v_client_id, v_service, 'interested')
    on conflict (client_id, service_type) do update set service_status = 'interested', updated_at = now();
  end loop;

  perform public.create_workspace_audit_event(
    p_workspace_id,
    case when v_is_update then 'client_updated' else 'client_created' end,
    'clients', v_client_id,
    case when v_is_update then 'Client updated' else 'Client created' end,
    case when v_is_update then 'Client record was updated.' else 'Client record was created.' end,
    v_client_id,
    null, null, null, null, null,
    jsonb_build_object('source','save_workspace_client','service_types',v_clean_services)
  );

  return jsonb_build_object('ok', true, 'client_id', v_client_id, 'service_types', to_jsonb(v_clean_services), 'message', case when v_is_update then 'Client updated.' else 'Client added.' end);
end;
$function$;
