create extension if not exists pgcrypto;
create table if not exists public.workspaces (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 workspace_type text not null check (workspace_type in ('independent_ptin','ero_office','service_bureau','platform_admin')),
 status text not null default 'active',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.user_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 first_name text,
 last_name text,
 role text not null,
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.audit_log (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid references public.workspaces(id) on delete cascade,
 actor_id uuid,
 entity_type text not null,
 entity_id uuid,
 action text not null,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.workspaces enable row level security;
alter table public.user_profiles enable row level security;
alter table public.audit_log enable row level security;
