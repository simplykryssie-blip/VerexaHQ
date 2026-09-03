create table public.automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  trigger_type text not null,
  trigger_config jsonb not null default '{}'::jsonb,
  conditions jsonb not null default '[]'::jsonb,
  is_enabled boolean not null default true,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);
comment on table public.automations is 'A trigger + conditions + ordered actions definition. trigger_type is intentionally free text (not an enum) so new trigger sources can be added by later phases without a migration.';

create unique index automations_system_slug_key on public.automations (slug) where workspace_id is null;
create index automations_workspace_idx on public.automations (workspace_id);
create index automations_trigger_type_idx on public.automations (trigger_type) where is_enabled;

create table public.automation_steps (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  display_order integer not null default 0,
  action_type text not null check (action_type in (
    'send_email', 'send_sms', 'send_notification', 'create_task', 'assign_user',
    'change_stage', 'request_approval', 'delay', 'webhook'
  )),
  action_config jsonb not null default '{}'::jsonb,
  delay_minutes integer not null default 0 check (delay_minutes >= 0),
  requires_approval boolean not null default false,
  approver_role_id uuid references public.roles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (automation_id, display_order) deferrable initially deferred
);
comment on table public.automation_steps is 'One action in an automation''s ordered chain. action_config shape depends on action_type (e.g. {template_id} for send_email, {stage_id} for change_stage).';

create index automation_steps_automation_idx on public.automation_steps (automation_id, display_order);

create trigger set_updated_at before update on public.automations for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.automation_steps for each row execute function public.set_updated_at();
create trigger audit_automations after insert or update or delete on public.automations for each row execute function public.audit_trigger_fn();
create trigger audit_automation_steps after insert or update or delete on public.automation_steps for each row execute function public.audit_trigger_fn();

alter table public.automations enable row level security;
alter table public.automation_steps enable row level security;

create policy automations_select on public.automations
  for select using (workspace_id is null or public.is_workspace_member(workspace_id));
create policy automations_insert on public.automations
  for insert with check (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy automations_update on public.automations
  for update using (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy automations_delete on public.automations
  for delete using (workspace_id is not null and public.is_workspace_admin(workspace_id));

create policy automation_steps_select on public.automation_steps
  for select using (
    exists (select 1 from public.automations a where a.id = automation_steps.automation_id
      and (a.workspace_id is null or public.is_workspace_member(a.workspace_id)))
  );
create policy automation_steps_write on public.automation_steps
  for all using (
    exists (select 1 from public.automations a where a.id = automation_steps.automation_id
      and a.workspace_id is not null and public.is_workspace_admin(a.workspace_id))
  )
  with check (
    exists (select 1 from public.automations a where a.id = automation_steps.automation_id
      and a.workspace_id is not null and public.is_workspace_admin(a.workspace_id))
  );
