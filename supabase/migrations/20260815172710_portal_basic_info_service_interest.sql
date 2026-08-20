-- Staff can already see what service a public-link lead asked for
-- (client_service_interests, populated by capture_public_lead_from_contact_step),
-- but a client who instead completes signup by logging in and filling out
-- the portal's Basic Info step never got asked -- so any client who reaches
-- the portal without going through the public organizer's Contact step (or
-- who changes their mind after) has no service interest on file for staff
-- to automate organizer preloading against. Adds the same category/service
-- picker to the Basic Info step.
alter table public.client_service_interests drop constraint client_service_interests_source_check;
alter table public.client_service_interests add constraint client_service_interests_source_check
  check (source = any (array['public_organizer_signup', 'manual', 'portal_basic_info']));

-- 1. Portal-session equivalent of get_public_service_options -- same shape,
--    but resolves the workspace from the caller's own client_portal_users
--    row instead of a public token, since there's already a session here.
create or replace function public.get_portal_service_options()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id
  from public.client_portal_users
  where user_id = auth.uid() and status = 'active'
  limit 1;

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

revoke all on function public.get_portal_service_options() from public, anon;
grant execute on function public.get_portal_service_options() to authenticated;

-- 2. The snapshot now also surfaces the client's most recent service
--    selection, so the Basic Info form can prefill it (same "confirm what's
--    on file" treatment as name/email/phone/address) instead of always
--    starting blank.
create or replace function public.get_portal_client_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_client_id uuid;
  v_client record;
  v_address record;
  v_interest record;
begin
  select client_id into v_client_id from public.client_portal_users where user_id = auth.uid() and status = 'active' limit 1;
  if v_client_id is null then
    raise exception 'no active portal identity for this user';
  end if;

  select client_type, first_name, middle_name, last_name, suffix, business_name, primary_email, primary_phone, date_of_birth, portal_basic_info_completed_at
  into v_client from public.clients where id = v_client_id;

  select street, city, state, zip into v_address
  from public.client_addresses
  where client_id = v_client_id and address_type = 'mailing'
  order by is_primary desc, created_at asc
  limit 1;

  select service_category_id, service_id into v_interest
  from public.client_service_interests
  where client_id = v_client_id
  order by created_at desc
  limit 1;

  return jsonb_build_object(
    'client_type', v_client.client_type,
    'first_name', v_client.first_name,
    'middle_name', v_client.middle_name,
    'last_name', v_client.last_name,
    'suffix', v_client.suffix,
    'business_name', v_client.business_name,
    'primary_email', v_client.primary_email,
    'primary_phone', v_client.primary_phone,
    'date_of_birth', v_client.date_of_birth,
    'basic_info_completed_at', v_client.portal_basic_info_completed_at,
    'mailing_street', v_address.street,
    'mailing_city', v_address.city,
    'mailing_state', v_address.state,
    'mailing_zip', v_address.zip,
    'service_category_id', v_interest.service_category_id,
    'service_id', v_interest.service_id
  );
end;
$$;

-- 3. submit_portal_basic_info now also records the chosen service --
--    two new trailing params change the signature, so drop the old 11-arg
--    overload first instead of leaving it stale alongside a new one.
drop function if exists public.submit_portal_basic_info(text, text, text, text, text, text, text, text, text, text, text);

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
  p_service_category_id uuid default null,
  p_service_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_client_id uuid;
  v_workspace_id uuid;
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

  if p_service_category_id is not null and p_service_id is not null then
    insert into public.client_service_interests (client_id, workspace_id, service_category_id, service_id, source)
    values (v_client_id, v_workspace_id, p_service_category_id, p_service_id, 'portal_basic_info');
  end if;

  update public.clients set portal_basic_info_completed_at = coalesce(portal_basic_info_completed_at, now())
  where id = v_client_id;
end;
$$;

revoke all on function public.submit_portal_basic_info(text, text, text, text, text, text, text, text, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.submit_portal_basic_info(text, text, text, text, text, text, text, text, text, text, text, uuid, uuid) to authenticated;
