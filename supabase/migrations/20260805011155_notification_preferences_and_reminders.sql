
create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_type text not null,
  channel text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workspace_id, event_type, channel)
);

alter table public.notification_preferences enable row level security;

create policy notification_preferences_select on public.notification_preferences
  for select using (user_id = auth.uid());
create policy notification_preferences_insert on public.notification_preferences
  for insert with check (user_id = auth.uid());
create policy notification_preferences_update on public.notification_preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notification_preferences_delete on public.notification_preferences
  for delete using (user_id = auth.uid());

create index notification_preferences_user_workspace_idx on public.notification_preferences (user_id, workspace_id);

-- Opt-out model: no row for a (user, workspace, event_type, channel) means enabled.
create or replace function public.is_notification_enabled(p_user_id uuid, p_workspace_id uuid, p_event_type text, p_channel text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select enabled from public.notification_preferences
     where user_id = p_user_id and workspace_id = p_workspace_id and event_type = p_event_type and channel = p_channel),
    true
  );
$$;

revoke all on function public.is_notification_enabled(uuid, uuid, text, text) from public;
grant execute on function public.is_notification_enabled(uuid, uuid, text, text) to authenticated, service_role;

-- Dedupe support so the reminder-enqueue job can run repeatedly without
-- double-sending the same reminder for the same entity.
alter table public.notification_queue add column if not exists dedupe_key text;
create unique index if not exists notification_queue_dedupe_key_uidx
  on public.notification_queue (workspace_id, template_key, dedupe_key)
  where dedupe_key is not null;

-- Scans due-date-bearing tables (invoices, pending signatures, workflow
-- stages) and enqueues one reminder job per not-yet-reminded entity.
-- SECURITY DEFINER because it needs auth.users for recipient emails and
-- runs from a service-role cron route with no session. Idempotent via the
-- dedupe index above -- safe to call on every cron tick.
create or replace function public.enqueue_reminder_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  r record;
begin
  for r in
    select i.id, i.workspace_id, i.due_date, i.total_amount, i.amount_paid, i.invoice_number,
           cpu.user_id, u.email
    from public.invoices i
    join public.client_portal_users cpu on cpu.client_id = i.client_id and cpu.is_primary = true and cpu.status = 'active'
    join auth.users u on u.id = cpu.user_id
    where i.status not in ('paid', 'void', 'draft')
      and i.amount_paid < i.total_amount
      and i.due_date is not null
      and i.due_date between now() and now() + interval '3 days'
  loop
    if public.is_notification_enabled(r.user_id, r.workspace_id, 'invoice_due', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key)
      values (r.workspace_id, 'Email', 'invoice-due-reminder', 'invoice_due',
              jsonb_build_object('invoice_number', r.invoice_number, 'due_date', r.due_date, 'amount_due', r.total_amount - r.amount_paid),
              r.user_id, r.email, 'invoice_due:' || r.id)
      on conflict (workspace_id, template_key, dedupe_key) do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  for r in
    select s.id as signer_id, sr.workspace_id, sr.due_date, sr.title, s.signer_name, s.signer_email
    from public.signature_request_signers s
    join public.signature_requests sr on sr.id = s.signature_request_id
    where s.status = 'pending'
      and sr.status = 'pending'
      and sr.due_date is not null
      and sr.due_date between now() and now() + interval '2 days'
      and s.signer_email is not null
  loop
    insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_email, dedupe_key)
    values (r.workspace_id, 'Email', 'signature-due-reminder', 'signature_due',
            jsonb_build_object('signer_name', r.signer_name, 'document_title', r.title, 'due_date', r.due_date),
            r.signer_email, 'signature_due:' || r.signer_id)
    on conflict (workspace_id, template_key, dedupe_key) do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;

  for r in
    select ws.id as stage_id, wr.workspace_id, ws.due_date, ws.stage_name, ws.reviewer_id, u.email
    from public.workflow_stages ws
    join public.workflow_runs wr on wr.id = ws.workflow_run_id
    join auth.users u on u.id = ws.reviewer_id
    where ws.status in ('Pending', 'In Progress', 'Waiting')
      and ws.due_date is not null
      and ws.due_date between now() and now() + interval '2 days'
      and ws.reviewer_id is not null
  loop
    if public.is_notification_enabled(r.reviewer_id, r.workspace_id, 'workflow_stage_due', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key)
      values (r.workspace_id, 'Email', 'workflow-stage-due-reminder', 'workflow_stage_due',
              jsonb_build_object('stage_name', r.stage_name, 'due_date', r.due_date),
              r.reviewer_id, r.email, 'workflow_stage_due:' || r.stage_id)
      on conflict (workspace_id, template_key, dedupe_key) do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_reminder_notifications() from public;
grant execute on function public.enqueue_reminder_notifications() to service_role;
