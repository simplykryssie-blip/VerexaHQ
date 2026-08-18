-- Services are now flat "basic" categories (Individual Tax Prep, Business Tax
-- Prep, Bookkeeping, Payroll, Business Services) -- a lead may need more than
-- one at once (e.g. Bookkeeping + Payroll), so intake becomes multi-select
-- instead of a single category->service cascade. Both lead-capture RPCs now
-- take an array of service ids and record one client_service_interests row
-- per selection, so each one independently fires the service-interest
-- automation and sends its own organizer.

drop function if exists public.capture_public_lead_from_contact_step(uuid, text, text, text, text, uuid, uuid, uuid, text, text, text, text, text, text);

create or replace function public.capture_public_lead_from_contact_step(
  p_token uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_service_ids uuid[],
  p_auth_user_id uuid default null,
  p_middle_name text default null,
  p_suffix text default null,
  p_mailing_street text default null,
  p_mailing_city text default null,
  p_mailing_state text default null,
  p_mailing_zip text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_has_address boolean;
  v_service_id uuid;
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

  update public.clients
  set middle_name = coalesce(middle_name, nullif(btrim(p_middle_name), '')),
      suffix = coalesce(suffix, nullif(btrim(p_suffix), ''))
  where id = v_client_id;

  if p_mailing_street is not null or p_mailing_city is not null or p_mailing_state is not null or p_mailing_zip is not null then
    select exists(select 1 from public.client_addresses where client_id = v_client_id and address_type = 'mailing') into v_has_address;
    if not v_has_address then
      insert into public.client_addresses (client_id, workspace_id, address_type, is_primary, display_order, street, city, state, zip)
      values (v_client_id, v_workspace_id, 'mailing', true, 0, nullif(btrim(p_mailing_street), ''), nullif(btrim(p_mailing_city), ''), nullif(btrim(p_mailing_state), ''), nullif(btrim(p_mailing_zip), ''));
    end if;
  end if;

  foreach v_service_id in array coalesce(p_service_ids, array[]::uuid[])
  loop
    insert into public.client_service_interests (client_id, workspace_id, service_category_id, service_id, source)
    select v_client_id, v_workspace_id, s.service_category_id, s.id, 'public_organizer_signup'
    from public.services s
    where s.id = v_service_id;
  end loop;

  if p_auth_user_id is not null then
    perform public.link_public_portal_account(v_workspace_id, v_client_id, p_auth_user_id, p_email, btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')));
  end if;

  perform public._notify_admins_of_new_public_lead(v_workspace_id, v_client_id);

  return jsonb_build_object('client_id', v_client_id);
end;
$function$;

revoke all on function public.capture_public_lead_from_contact_step(uuid, text, text, text, text, uuid[], uuid, text, text, text, text, text, text) from public;
grant execute on function public.capture_public_lead_from_contact_step(uuid, text, text, text, text, uuid[], uuid, text, text, text, text, text, text) to anon, authenticated;

drop function if exists public.submit_portal_basic_info(text, text, text, text, text, text, text, text, text, text, text, uuid, uuid);

create or replace function public.submit_portal_basic_info(
  p_first_name text default null,
  p_last_name text default null,
  p_business_name text default null,
  p_primary_email text default null,
  p_primary_phone text default null,
  p_mailing_street text default null,
  p_mailing_city text default null,
  p_mailing_state text default null,
  p_mailing_zip text default null,
  p_middle_name text default null,
  p_suffix text default null,
  p_service_ids uuid[] default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_client_id uuid;
  v_workspace_id uuid;
  v_service_id uuid;
begin
  select client_id, workspace_id into v_client_id, v_workspace_id
  from public.client_portal_users where user_id = auth.uid() and status = 'active' limit 1;
  if v_client_id is null then
    raise exception 'no active portal identity for this user';
  end if;

  if p_first_name is not null then perform public.propose_client_contact_field('first_name', p_first_name); end if;
  if p_middle_name is not null then perform public.propose_client_contact_field('middle_name', p_middle_name); end if;
  if p_last_name is not null then perform public.propose_client_contact_field('last_name', p_last_name); end if;
  if p_suffix is not null then perform public.propose_client_contact_field('suffix', p_suffix); end if;
  if p_business_name is not null then perform public.propose_client_contact_field('business_name', p_business_name); end if;
  if p_primary_email is not null then perform public.propose_client_contact_field('primary_email', p_primary_email); end if;
  if p_primary_phone is not null then perform public.propose_client_contact_field('primary_phone', p_primary_phone); end if;

  if p_mailing_street is not null or p_mailing_city is not null or p_mailing_state is not null or p_mailing_zip is not null then
    perform public.propose_client_mailing_address(p_mailing_street, p_mailing_city, p_mailing_state, p_mailing_zip);
  end if;

  foreach v_service_id in array coalesce(p_service_ids, array[]::uuid[])
  loop
    insert into public.client_service_interests (client_id, workspace_id, service_category_id, service_id, source)
    select v_client_id, v_workspace_id, s.service_category_id, s.id, 'portal_basic_info'
    from public.services s
    where s.id = v_service_id;
  end loop;

  update public.clients set portal_basic_info_completed_at = coalesce(portal_basic_info_completed_at, now())
  where id = v_client_id;
end;
$function$;

revoke all on function public.submit_portal_basic_info(text, text, text, text, text, text, text, text, text, text, text, uuid[]) from public, anon;
grant execute on function public.submit_portal_basic_info(text, text, text, text, text, text, text, text, text, text, text, uuid[]) to authenticated;
