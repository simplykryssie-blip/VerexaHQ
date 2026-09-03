create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
comment on table public.audit_log is 'Immutable compliance audit trail. Insert-only, written by triggers/security-definer RPCs, never editable from the client.';

create index audit_log_workspace_created_idx on public.audit_log (workspace_id, created_at desc);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_log_actor_idx on public.audit_log (actor_id);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  activity_type text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.activity_log is 'Append-only, user-facing activity timeline (e.g. "Jane sent the engagement letter").';

create index activity_log_workspace_created_idx on public.activity_log (workspace_id, created_at desc);
create index activity_log_entity_idx on public.activity_log (entity_type, entity_id);

create table public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete cascade,
  recipient_email citext,
  recipient_phone text,
  channel text not null check (channel in ('email', 'sms', 'portal', 'push')),
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.notification_queue is 'Outbound notification job queue, drained by a worker/Edge Function. Not a delivery log.';

create index notification_queue_pending_idx on public.notification_queue (scheduled_at) where status = 'pending';
create index notification_queue_workspace_idx on public.notification_queue (workspace_id);
create index notification_queue_recipient_idx on public.notification_queue (recipient_user_id);
