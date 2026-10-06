-- Two pieces of the booking-availability request: a service that should
-- only be bookable during part of the year (e.g. tax review season) or on
-- specific weekdays, and staff being able to block their own personal days
-- off separately from the firm-wide closures already in system_settings
-- (holidays). Both are additive -- every existing service keeps booking
-- exactly as it does today (season_start/season_end/allowed_weekdays all
-- default to null, meaning "no restriction").

alter table public.services
  add column if not exists season_start text,
  add column if not exists season_end text,
  add column if not exists allowed_weekdays integer[];

alter table public.services
  add constraint services_season_pair check ((season_start is null) = (season_end is null));

alter table public.services
  add constraint services_season_start_format check (season_start is null or season_start ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$');

alter table public.services
  add constraint services_season_end_format check (season_end is null or season_end ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$');

create table if not exists public.staff_time_off (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint staff_time_off_date_range check (end_date >= start_date)
);

create index if not exists idx_staff_time_off_workspace on public.staff_time_off(workspace_id);
create index if not exists idx_staff_time_off_user on public.staff_time_off(user_id);

alter table public.staff_time_off enable row level security;

-- Any active member of the workspace can see who's out -- same visibility
-- level as the workspace roster itself, needed for a shared team calendar.
create policy staff_time_off_select on public.staff_time_off
  for select using (
    exists (select 1 from public.workspace_users wu where wu.workspace_id = staff_time_off.workspace_id and wu.user_id = auth.uid() and wu.status = 'active')
  );

create policy staff_time_off_insert on public.staff_time_off
  for insert with check (
    exists (select 1 from public.workspace_users wu where wu.workspace_id = staff_time_off.workspace_id and wu.user_id = auth.uid() and wu.status = 'active')
    and (user_id = auth.uid() or public.has_permission(workspace_id, 'users.manage'))
  );

create policy staff_time_off_delete on public.staff_time_off
  for delete using (
    user_id = auth.uid() or public.has_permission(workspace_id, 'users.manage')
  );
