-- Phase 0: Platform Foundation
-- Core multi-tenant tables: workspaces, global user profiles, RBAC catalog, membership.
-- Replaces the minimal placeholder schema (workspaces/user_profiles/audit_log) created at
-- project provisioning time with the full production design.

drop table if exists public.audit_log cascade;
drop table if exists public.user_profiles cascade;
drop table if exists public.workspaces cascade;

-- ============================================================================
-- workspaces: the tenant. Independent PTIN preparers, ERO offices, service
-- bureaus, and multi-office firms are all "workspaces" distinguished by type,
-- so the schema never has to be redesigned as the firm grows.
-- ============================================================================
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  workspace_type text not null default 'independent_ptin'
    check (workspace_type in ('independent_ptin', 'ero_office', 'service_bureau', 'multi_office_firm', 'platform_admin')),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  timezone text not null default 'America/New_York',
  primary_contact_email citext,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.workspaces is 'Tenant root. Every workspace-scoped table carries a workspace_id back to this table.';
comment on column public.workspaces.workspace_type is 'Distinguishes independent preparers, ERO offices, service bureaus, and multi-office firms without changing schema shape.';
comment on column public.workspaces.slug is 'URL-safe unique identifier, used for portal subdomains and routing.';

create index workspaces_status_idx on public.workspaces (status);
create index workspaces_name_trgm_idx on public.workspaces using gin (name gin_trgm_ops);

-- ============================================================================
-- user_profiles: one row per authenticated user, independent of any single
-- workspace. Multi-tenant membership (which workspaces, which role) lives in
-- workspace_users below so a preparer can belong to more than one firm.
-- ============================================================================
create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  display_name text,
  phone text,
  avatar_url text,
  default_workspace_id uuid references public.workspaces(id) on delete set null,
  is_platform_admin boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.user_profiles is 'Global identity for an authenticated user, decoupled from workspace membership.';
comment on column public.user_profiles.is_platform_admin is 'Verexa staff superuser flag. Not a workspace role; grants cross-tenant support access.';

create index user_profiles_default_workspace_idx on public.user_profiles (default_workspace_id);

-- ============================================================================
-- permissions: global, never workspace-scoped catalog of grantable actions.
-- Every phase adds its own keys here rather than inventing a new access model.
-- ============================================================================
create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  category text not null,
  description text not null,
  created_at timestamptz not null default now()
);
comment on table public.permissions is 'Master catalog of permission keys checked by has_permission(). Additive across phases.';

create index permissions_category_idx on public.permissions (category);

-- ============================================================================
-- roles: workspace_id NULL = system role template shared by every workspace
-- (Owner, Admin, ERO, PTIN Preparer, Staff). workspace_id set = a custom role
-- scoped to that one workspace. Avoids duplicating role rows per tenant.
-- ============================================================================
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null check (slug ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  description text,
  is_system_role boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);
comment on table public.roles is 'workspace_id NULL rows are global system role templates; non-NULL rows are workspace-custom roles.';

-- unique(workspace_id, slug) does not stop duplicate slugs across multiple
-- NULL-workspace rows (NULLs are never equal), so enforce that separately.
create unique index roles_system_role_slug_key on public.roles (slug) where workspace_id is null;
create index roles_workspace_idx on public.roles (workspace_id);

-- ============================================================================
-- role_permissions: join table granting permissions to a role.
-- ============================================================================
create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);
comment on table public.role_permissions is 'Grants a permission to a role. A workspace_user inherits permissions through their role.';

create index role_permissions_permission_idx on public.role_permissions (permission_id);

-- ============================================================================
-- workspace_users: membership + role assignment linking auth.users to a
-- workspace. A user row can appear in many workspaces with different roles.
-- ============================================================================
create table public.workspace_users (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  is_owner boolean not null default false,
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended', 'removed')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
comment on table public.workspace_users is 'Tenant membership: which user, which workspace, which role, what status.';

create index workspace_users_user_idx on public.workspace_users (user_id);
create index workspace_users_workspace_status_idx on public.workspace_users (workspace_id, status);
create index workspace_users_role_idx on public.workspace_users (role_id);
