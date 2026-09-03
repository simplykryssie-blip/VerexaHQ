create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  module text not null,
  is_core boolean not null default false,
  default_enabled boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.feature_flags is 'Global catalog of togglable modules/features. is_core flags are auto-enabled for every new workspace.';

create table public.workspace_feature_flags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  feature_flag_id uuid not null references public.feature_flags(id) on delete cascade,
  is_enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (workspace_id, feature_flag_id)
);
comment on table public.workspace_feature_flags is 'Per-workspace override of a feature flag, with optional module-specific config.';

create index workspace_feature_flags_workspace_idx on public.workspace_feature_flags (workspace_id);
create index workspace_feature_flags_flag_idx on public.workspace_feature_flags (feature_flag_id);
