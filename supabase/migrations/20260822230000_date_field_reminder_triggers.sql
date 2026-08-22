-- Gap #6 from the GHL capability audit: no way to start a workflow off a
-- stored date rather than an event -- "3 days before the extension
-- deadline," "on the client's birthday." Scoped to the three clearest,
-- most valuable cases for a tax practice rather than every date column on
-- every table: an engagement's due date, a quote's expiration, and a
-- client's birthday. A dynamic "N days before ANY date field" mode belongs
-- with the future business-hours due-date engine, not duplicated here.

-- Dedupe table: the cron runs every 6 hours (matching check-overdue-tasks),
-- but current_date = target_date only holds true for one calendar day --
-- this stops it from firing more than once per entity per day even if the
-- cron runs multiple times that day.
create table public.automation_date_reminders_sent (
  automation_id uuid not null references public.automations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  reminder_date date not null,
  sent_at timestamptz not null default now(),
  primary key (automation_id, entity_type, entity_id, reminder_date)
);

alter table public.automation_date_reminders_sent enable row level security;

create policy automation_date_reminders_sent_select on public.automation_date_reminders_sent
  for select using (
    exists (select 1 from public.automations a where a.id = automation_id and public.is_workspace_member(a.workspace_id))
  );

create or replace function public.fire_date_reminder_automations()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  r record;
  v_target_date date;
  v_context jsonb;
  v_run_id uuid;
  v_count int := 0;
  v_direction text;
  v_days int;
  v_inserted boolean;
begin
  for v_automation in
    select * from public.automations
    where is_enabled = true and status = 'published' and trigger_type = 'engagement.due_date_reminder'
  loop
    v_direction := coalesce(v_automation.trigger_config->>'direction', 'before');
    v_days := coalesce((v_automation.trigger_config->>'days')::int, 0);
    for r in
      select id, workspace_id, client_id, due_date::date as due_date
      from public.engagements
      where workspace_id = v_automation.workspace_id and due_date is not null
        and status not in ('Completed', 'Archived')
    loop
      v_target_date := case when v_direction = 'after' then r.due_date + v_days else r.due_date - v_days end;
      if v_target_date = current_date then
        insert into public.automation_date_reminders_sent (automation_id, entity_type, entity_id, reminder_date)
        values (v_automation.id, 'engagement', r.id, current_date)
        on conflict do nothing;
        get diagnostics v_inserted = row_count;
        if v_inserted then
          v_context := jsonb_build_object('engagement_id', r.id, 'due_date', r.due_date::text);
          if public.evaluate_automation_conditions(v_automation.conditions, v_context, r.workspace_id, r.client_id, r.id) then
            insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
            values (r.workspace_id, v_automation.id, r.id, r.client_id, v_context, 'running')
            returning id into v_run_id;
            perform public.start_next_automation_step(v_run_id);
            v_count := v_count + 1;
          end if;
        end if;
      end if;
    end loop;
  end loop;

  for v_automation in
    select * from public.automations
    where is_enabled = true and status = 'published' and trigger_type = 'quote.expiring_reminder'
  loop
    v_direction := coalesce(v_automation.trigger_config->>'direction', 'before');
    v_days := coalesce((v_automation.trigger_config->>'days')::int, 0);
    for r in
      select id, workspace_id, client_id, engagement_id, valid_until
      from public.quotes
      where workspace_id = v_automation.workspace_id and valid_until is not null
        and status not in ('accepted', 'declined')
    loop
      v_target_date := case when v_direction = 'after' then r.valid_until + v_days else r.valid_until - v_days end;
      if v_target_date = current_date then
        insert into public.automation_date_reminders_sent (automation_id, entity_type, entity_id, reminder_date)
        values (v_automation.id, 'quote', r.id, current_date)
        on conflict do nothing;
        get diagnostics v_inserted = row_count;
        if v_inserted then
          v_context := jsonb_build_object('quote_id', r.id, 'valid_until', r.valid_until::text);
          if public.evaluate_automation_conditions(v_automation.conditions, v_context, r.workspace_id, r.client_id, r.engagement_id) then
            insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
            values (r.workspace_id, v_automation.id, r.engagement_id, r.client_id, v_context, 'running')
            returning id into v_run_id;
            perform public.start_next_automation_step(v_run_id);
            v_count := v_count + 1;
          end if;
        end if;
      end if;
    end loop;
  end loop;

  for v_automation in
    select * from public.automations
    where is_enabled = true and status = 'published' and trigger_type = 'client.birthday_reminder'
  loop
    v_direction := coalesce(v_automation.trigger_config->>'direction', 'before');
    v_days := coalesce((v_automation.trigger_config->>'days')::int, 0);
    for r in
      select id, workspace_id, date_of_birth
      from public.clients
      where workspace_id = v_automation.workspace_id and date_of_birth is not null
        and lifecycle_status not in ('archived', 'lost')
    loop
      begin
        v_target_date := make_date(extract(year from current_date)::int, extract(month from r.date_of_birth)::int, extract(day from r.date_of_birth)::int);
      exception when others then
        continue;
      end;
      v_target_date := case when v_direction = 'after' then v_target_date + v_days else v_target_date - v_days end;
      if v_target_date = current_date then
        insert into public.automation_date_reminders_sent (automation_id, entity_type, entity_id, reminder_date)
        values (v_automation.id, 'client', r.id, current_date)
        on conflict do nothing;
        get diagnostics v_inserted = row_count;
        if v_inserted then
          v_context := jsonb_build_object('client_id', r.id, 'date_of_birth', r.date_of_birth::text);
          if public.evaluate_automation_conditions(v_automation.conditions, v_context, r.workspace_id, r.id, null) then
            insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
            values (r.workspace_id, v_automation.id, r.id, v_context, 'running')
            returning id into v_run_id;
            perform public.start_next_automation_step(v_run_id);
            v_count := v_count + 1;
          end if;
        end if;
      end if;
    end loop;
  end loop;

  return v_count;
end;
$function$;
