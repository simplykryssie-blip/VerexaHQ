-- Same multi-select shift as the public organizer contact step: return every
-- currently-selected service (distinct service_ids across all interests),
-- not just the single most recent one, so the portal's Basic Info step can
-- pre-check every box the client already picked.
create or replace function public.get_portal_client_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_client_id uuid;
  v_client record;
  v_address record;
  v_service_ids uuid[];
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

  select coalesce(array_agg(distinct service_id), array[]::uuid[]) into v_service_ids
  from public.client_service_interests
  where client_id = v_client_id and service_id is not null;

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
    'service_ids', to_jsonb(v_service_ids)
  );
end;
$function$;
