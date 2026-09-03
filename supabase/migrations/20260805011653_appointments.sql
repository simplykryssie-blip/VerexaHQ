
insert into public.permissions (key, category, description) values
  ('appointments.view', 'appointments', 'View appointments'),
  ('appointments.manage', 'appointments', 'Create, reschedule, and cancel appointments')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'appointments.view'
where r.name in ('Admin', 'Administrative Staff', 'ERO', 'Owner', 'PTIN Preparer', 'Reviewer', 'Staff')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'appointments.manage'
where r.name in ('Admin', 'Administrative Staff', 'ERO', 'Owner', 'PTIN Preparer')
on conflict do nothing;

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  engagement_id uuid references public.engagements(id) on delete set null,
  staff_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  portal_visible boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appointments_workspace_idx on public.appointments (workspace_id);
create index appointments_client_idx on public.appointments (client_id);
create index appointments_engagement_idx on public.appointments (engagement_id);
create index appointments_staff_idx on public.appointments (staff_id);
create index appointments_start_at_idx on public.appointments (start_at);

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

alter table public.appointments enable row level security;

create policy appointments_select on public.appointments
  for select using (public.has_permission(workspace_id, 'appointments.view'));

create policy appointments_portal_select on public.appointments
  for select using (portal_visible and client_id is not null and public.is_portal_user(client_id));

create policy appointments_insert on public.appointments
  for insert with check (public.has_permission(workspace_id, 'appointments.manage'));

create policy appointments_update on public.appointments
  for update using (public.has_permission(workspace_id, 'appointments.manage'));

create policy appointments_delete on public.appointments
  for delete using (public.has_permission(workspace_id, 'appointments.manage'));
