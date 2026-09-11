-- The organizer-submitted staff notification never included the client's
-- name in its payload -- only client_id (a UUID) -- so presentNotification()
-- could only ever render "<Organizer Name> was submitted", with no way to
-- say who submitted it. Add client_name so the title can say who.

create or replace function public._notify_admins_of_organizer_submitted(
  p_workspace_id uuid,
  p_client_id uuid,
  p_response_id uuid,
  p_organizer_template_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_recipient record;
  v_template_name text;
  v_client_name text;
begin
  select name into v_template_name from public.organizer_templates where id = p_organizer_template_id;

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
      p_workspace_id, v_recipient.user_id, 'ORGANIZER_SUBMITTED',
      'organizer_submitted',
      jsonb_build_object('client_id', p_client_id, 'client_name', v_client_name, 'response_id', p_response_id, 'organizer_template_name', v_template_name),
      array['In-App'::text], 'Medium', 'client', p_client_id
    );
  end loop;
end;
$function$;
