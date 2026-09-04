-- Workflow versioning (Draft/Published/Paused/Retired) + test mode.
--
-- Versioning: automations.status (draft/published/archived) and
-- automation_execution_logs.is_enabled already existed, but nothing set
-- status on creation or enforced the relationship between them, so every
-- new automation was created status='published' is_enabled=true by
-- default -- live and eligible to fire the instant it's named, before a
-- single step is configured. Flip the defaults so a new automation starts
-- as an inert draft, and add a trigger that forces is_enabled=false
-- whenever status isn't 'published', so the UI can freely offer
-- Draft/Published/Paused/Retired without ever risking a draft or retired
-- automation actually firing (every fire_*_automations function already
-- filters on `is_enabled = true and status = 'published'`, so this is the
-- one place that needs to hold for that filter to mean what it says).
alter table public.automations alter column status set default 'draft';
alter table public.automations alter column is_enabled set default false;

create or replace function public.enforce_automation_status_enabled()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('draft', 'archived') then
    new.is_enabled := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_automation_status_enabled on public.automations;
create trigger trg_enforce_automation_status_enabled
before insert or update of status, is_enabled on public.automations
for each row execute function public.enforce_automation_status_enabled();

-- Test mode: run_automation_test lets staff fire a real automation run
-- against a real client/engagement they pick, so every trigger condition,
-- merge field, assignment rule, and pipeline move is exercised exactly as
-- it would run live -- but flagged is_test so execute_automation_step can
-- skip the handful of action types that would put something in front of
-- the client (send_email, send_sms, send_portal_message,
-- send_engagement_letter, invite_to_portal, webhook, send_quote) instead
-- of faking their result. Internal-only actions (tasks, notes, tags,
-- assignment, pipeline stage, quote drafts, client field updates) still
-- execute for real against whichever client was chosen -- that's what
-- makes the test trustworthy rather than a guess.
alter table public.automation_runs add column if not exists is_test boolean not null default false;
alter table public.notification_queue add column if not exists is_test boolean not null default false;

alter table public.notification_queue drop constraint if exists notification_queue_status_check;
alter table public.notification_queue add constraint notification_queue_status_check
  check (status = any (array['pending', 'sent', 'failed', 'cancelled', 'simulated']));

create or replace function public.run_automation_test(p_automation_id uuid, p_client_id uuid, p_engagement_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_automation record;
  v_client record;
  v_issues record;
  v_context jsonb;
  v_run_id uuid;
begin
  select * into v_automation from public.automations where id = p_automation_id;
  if v_automation.id is null then
    raise exception 'Automation not found';
  end if;
  if not public.has_permission(v_automation.workspace_id, 'automations.manage') then
    raise exception 'You do not have permission to test workflows';
  end if;

  select id, workspace_id into v_client from public.clients where id = p_client_id;
  if v_client.id is null or v_client.workspace_id <> v_automation.workspace_id then
    raise exception 'Client not found in this workspace';
  end if;

  if p_engagement_id is not null and not exists (
    select 1 from public.engagements where id = p_engagement_id and client_id = p_client_id
  ) then
    raise exception 'Engagement does not belong to this client';
  end if;

  for v_issues in select * from public.validate_automation(p_automation_id) loop
    raise exception 'Fix this workflow before testing it -- %: %', v_issues.display_name, v_issues.issue;
  end loop;

  v_context := jsonb_build_object('test_mode', true);

  insert into public.automation_runs (workspace_id, automation_id, client_id, engagement_id, trigger_snapshot, status, is_test)
  values (v_automation.workspace_id, p_automation_id, p_client_id, p_engagement_id, v_context, 'running', true)
  returning id into v_run_id;

  perform public.start_next_automation_step(v_run_id);

  return v_run_id;
end;
$$;
