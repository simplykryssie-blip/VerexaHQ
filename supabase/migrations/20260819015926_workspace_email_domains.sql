create table public.workspace_email_domains (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  domain text not null,
  resend_domain_id text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'failed')),
  dns_records jsonb not null default '[]'::jsonb,
  from_local_part text not null default 'notifications',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (workspace_id)
);

create index workspace_email_domains_workspace_id_idx on public.workspace_email_domains (workspace_id);

alter table public.workspace_email_domains enable row level security;

create policy workspace_email_domains_select on public.workspace_email_domains
for select to authenticated
using (has_permission(workspace_id, 'settings.manage'::text));

create trigger workspace_email_domains_set_updated_at
before update on public.workspace_email_domains
for each row execute function public.set_updated_at();
