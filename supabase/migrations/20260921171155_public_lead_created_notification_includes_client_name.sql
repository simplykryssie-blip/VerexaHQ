-- The PUBLIC_LEAD_CREATED notification (fired the moment someone finishes
-- the public organizer's Contact step, before they've actually answered
-- any questions) only ever carried client_id in its payload, so it had no
-- entry in lib/notifications/present.ts's TITLES map and rendered as the
-- raw event_type ("PUBLIC LEAD CREATED"). Adding client_name here lets the
-- frontend render something that actually distinguishes "a lead was
-- captured but hasn't finished the form yet" from ORGANIZER_SUBMITTED
-- ("they finished it"), which the two events were already easy to conflate.
create or replace function public._notify_admins_of_new_public_lead(p_workspace_id uuid, p_client_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_recipient record;
  v_client_name text;
begin
  select case when client_type = 'business' and business_name is not null then business_name
              else btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
         end
  into v_client_name
  from public.clients where id = p_client_id;

  for v_recipient in
    select wu.user_id from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    where wu.workspace_id = p_workspace_id and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  loop
    perform public.create_notification(
      p_workspace_id, v_recipient.user_id, 'PUBLIC_LEAD_CREATED',
      'public_lead_created', jsonb_build_object('client_id', p_client_id, 'client_name', v_client_name),
      array['In-App'::text], 'Medium', 'client', p_client_id
    );
  end loop;
end;
$function$;
