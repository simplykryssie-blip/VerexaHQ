-- Epic 4: Messaging subsystem. Reuses messages.view/messages.send/
-- messages.internal_note permission keys already seeded in Phase 0, the
-- existing polymorphic entity_type/entity_id pattern from notes/attachments,
-- and the existing attachments table for message attachments (entity_type
-- = 'message'). Does not duplicate email_templates/sms_templates/
-- notification_queue -- those are reused as-is.

create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  entity_type text not null default 'client',
  entity_id uuid not null,
  subject text,
  channel text not null default 'portal',
  status text not null default 'open',
  last_message_at timestamptz,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_type text not null default 'staff',
  sender_id uuid,
  body text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  message_id uuid references public.messages(id),
  template_key text,
  recipient_email text not null,
  subject text,
  status text not null default 'queued',
  provider_reference text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.sms_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  message_id uuid references public.messages(id),
  template_key text,
  recipient_phone text not null,
  body text not null,
  status text not null default 'queued',
  provider_reference text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.communication_preferences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  client_id uuid not null references public.clients(id) on delete cascade,
  preferred_channel text not null default 'email',
  email_opt_in boolean not null default true,
  sms_opt_in boolean not null default true,
  do_not_contact boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (client_id)
);

create index idx_message_threads_workspace on public.message_threads(workspace_id);
create index idx_message_threads_entity on public.message_threads(entity_type, entity_id);
create index idx_messages_workspace on public.messages(workspace_id);
create index idx_messages_thread on public.messages(thread_id);
create index idx_email_log_workspace on public.email_log(workspace_id);
create index idx_sms_log_workspace on public.sms_log(workspace_id);
create index idx_communication_preferences_workspace on public.communication_preferences(workspace_id);

create trigger trg_updated_at before update on public.message_threads for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.communication_preferences for each row execute function public.set_updated_at();

create trigger trg_audit after insert or update or delete on public.message_threads for each row execute function public.audit_trigger_fn();
create trigger trg_audit after insert or update or delete on public.messages for each row execute function public.audit_trigger_fn();

-- Keep the thread's last_message_at current without a round trip from the app.
create or replace function public.touch_message_thread()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  update public.message_threads set last_message_at = new.created_at where id = new.thread_id;
  return new;
end;
$$;
create trigger trg_touch_message_thread after insert on public.messages for each row execute function public.touch_message_thread();

alter table public.message_threads enable row level security;
alter table public.messages enable row level security;
alter table public.email_log enable row level security;
alter table public.sms_log enable row level security;
alter table public.communication_preferences enable row level security;

create policy message_threads_select on public.message_threads for select using (has_permission(workspace_id, 'messages.view'));
create policy message_threads_write on public.message_threads for insert with check (has_permission(workspace_id, 'messages.view'));
create policy message_threads_update on public.message_threads for update using (has_permission(workspace_id, 'messages.view')) with check (has_permission(workspace_id, 'messages.view'));
create policy message_threads_delete on public.message_threads for delete using (is_workspace_admin(workspace_id));

create policy messages_select on public.messages for select using (has_permission(workspace_id, 'messages.view'));
create policy messages_write on public.messages for insert with check (
  has_permission(workspace_id, 'messages.send')
  or (is_internal and has_permission(workspace_id, 'messages.internal_note'))
);
create policy messages_delete on public.messages for delete using (is_workspace_admin(workspace_id));

create policy email_log_select on public.email_log for select using (has_permission(workspace_id, 'messages.view'));
create policy email_log_write on public.email_log for insert with check (has_permission(workspace_id, 'messages.send'));

create policy sms_log_select on public.sms_log for select using (has_permission(workspace_id, 'messages.view'));
create policy sms_log_write on public.sms_log for insert with check (has_permission(workspace_id, 'messages.send'));

create policy communication_preferences_select on public.communication_preferences for select using (has_permission(workspace_id, 'clients.view'));
create policy communication_preferences_write on public.communication_preferences for insert with check (has_permission(workspace_id, 'clients.edit'));
create policy communication_preferences_update on public.communication_preferences for update using (has_permission(workspace_id, 'clients.edit')) with check (has_permission(workspace_id, 'clients.edit'));
