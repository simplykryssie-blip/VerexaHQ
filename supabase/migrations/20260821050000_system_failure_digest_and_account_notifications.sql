-- System-level failures (things staff can't fix themselves -- missing
-- templates/env vars, storage/DB errors, Resend outages/key issues) get
-- logged here and drained into a periodic digest email to
-- failedsystem@verexahq.com. Account-level failures (bad client data, a
-- misconfigured automation step) instead notify the workspace's own
-- admins in-app via notify_workspace_admins() -- they're the ones who can
-- actually fix those, not platform IT.
create table public.system_failure_log (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  message text not null,
  context jsonb,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);

alter table public.system_failure_log enable row level security;

-- Platform admins can review these in a future dashboard; everyone else
-- (including the workspace the failure happened in) has no access --
-- this is Verexa's own operational log, not workspace data.
create policy system_failure_log_select on public.system_failure_log
  for select using (public.is_platform_admin());

create index system_failure_log_unnotified_idx on public.system_failure_log (created_at) where notified_at is null;

-- Shared fan-out helper: notify every active owner/admin of a workspace.
-- Reused by the automation-failure trigger below and by the two
-- email-queue cron routes for their one account-level failure case
-- (a bad recipient address on the client's record).
create or replace function public.notify_workspace_admins(
  p_workspace_id uuid,
  p_type text,
  p_template_key text,
  p_payload jsonb,
  p_channels text[],
  p_priority text,
  p_entity_type text,
  p_entity_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_recipient record;
begin
  for v_recipient in
    select wu.user_id
    from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    where wu.workspace_id = p_workspace_id and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  loop
    perform public.create_notification(
      p_workspace_id, v_recipient.user_id, p_type, p_template_key, p_payload, p_channels, p_priority, p_entity_type, p_entity_id
    );
  end loop;
end;
$function$;

grant execute on function public.notify_workspace_admins(uuid, text, text, jsonb, text[], text, text, uuid) to authenticated, service_role;

-- Every automation_execution_logs failure examined is staff-fixable
-- (missing client data, a step referencing a deleted template, an
-- unresolvable target stage, etc.) -- none are platform bugs. Nobody was
-- ever told when one happened; a workspace had to think to check the
-- automation's own execution log tab. Notify the workspace's admins the
-- moment a step fails instead.
create or replace function public.notify_admins_of_automation_failure()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'failed' then
    perform public.notify_workspace_admins(
      new.workspace_id,
      'AUTOMATION_STEP_FAILED',
      'automation_step_failed',
      jsonb_build_object(
        'error', new.error_message,
        'action_type', new.execution_data->>'action_type',
        'automation_id', new.automation_id
      ),
      array['In-App']::text[],
      'Medium',
      'automation',
      new.automation_id
    );
  end if;
  return new;
end;
$function$;

create trigger trg_notify_admins_of_automation_failure
  after insert on public.automation_execution_logs
  for each row execute function public.notify_admins_of_automation_failure();
