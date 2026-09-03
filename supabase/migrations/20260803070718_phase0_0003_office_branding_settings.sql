create table public.office_locations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  is_primary boolean not null default false,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text not null default 'US',
  phone text,
  email citext,
  timezone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.office_locations is 'Physical or virtual office locations belonging to a workspace (multi-office firms have several).';

create index office_locations_workspace_idx on public.office_locations (workspace_id);
create unique index office_locations_one_primary_per_workspace
  on public.office_locations (workspace_id) where is_primary;

create table public.branding (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  display_name text,
  logo_url text,
  favicon_url text,
  primary_color text not null default '#0f172a' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color text not null default '#2563eb' check (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  accent_color text not null default '#22c55e' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  portal_subdomain text unique check (portal_subdomain ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  custom_domain text unique,
  email_from_name text,
  support_email citext,
  support_phone text,
  updated_at timestamptz not null default now()
);
comment on table public.branding is 'White-label presentation settings for the firm-facing app and client portal, one row per workspace.';

create table public.system_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (workspace_id, key)
);
comment on table public.system_settings is 'Generic per-workspace settings keyed by string, e.g. business_hours, notification_defaults, engagement_terms.';

create index system_settings_workspace_idx on public.system_settings (workspace_id);
