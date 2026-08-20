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
begin
  select name into v_template_name from public.organizer_templates where id = p_organizer_template_id;

  for v_recipient in
    select wu.user_id from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    where wu.workspace_id = p_workspace_id and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  loop
    perform public.create_notification(
      p_workspace_id, v_recipient.user_id, 'ORGANIZER_SUBMITTED',
      'organizer_submitted',
      jsonb_build_object('client_id', p_client_id, 'response_id', p_response_id, 'organizer_template_name', v_template_name),
      array['In-App'::text], 'Medium', 'client', p_client_id
    );
  end loop;
end;
$function$;

create or replace function public.fire_organizer_submitted_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_engagement_id uuid;
begin
  if not (
    (TG_OP = 'INSERT' and NEW.status in ('submitted', 'reviewed'))
    or (TG_OP = 'UPDATE' and NEW.status in ('submitted', 'reviewed') and OLD.status is distinct from NEW.status)
  ) then
    return NEW;
  end if;

  v_engagement_id := NEW.engagement_id;
  if v_engagement_id is null then
    select id into v_engagement_id from public.engagements
    where client_id = NEW.client_id and status not in ('Completed', 'Archived')
    order by created_at desc limit 1;
  end if;

  if NEW.status = 'submitted' then
    perform public._notify_admins_of_organizer_submitted(NEW.workspace_id, NEW.client_id, NEW.id, NEW.organizer_template_id);
  end if;

  v_context := jsonb_build_object('organizer_template_id', NEW.organizer_template_id, 'status', NEW.status, 'response_id', NEW.id);

  for v_automation in
    select * from public.automations
    where workspace_id = NEW.workspace_id
      and is_enabled = true
      and status = 'published'
      and trigger_type = 'organizer.submitted'
      and trigger_config ->> 'organizer_template_id' = NEW.organizer_template_id::text
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (NEW.workspace_id, v_automation.id, v_engagement_id, NEW.client_id, v_context, 'running')
      returning id into v_run_id;

      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return NEW;
end;
$function$;
