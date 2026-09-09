-- Calendar/booking customization: per-staff working hours + timezone,
-- per-service booking overrides, and multiple booking locations. Workspace
-- timezone already exists (workspaces.timezone) but nothing reads it yet --
-- that's a code-side fix, not a schema one.

-- A person's own timezone preference, used only when a booking link is
-- scoped to them specifically ("book time with Monica") -- otherwise the
-- workspace's timezone applies. Lives on user_profiles (person-level, not
-- per-membership) since a person's own timezone doesn't change based on
-- which workspace they're acting in.
alter table public.user_profiles add column if not exists timezone text;

-- Per-staff weekly working hours, overriding the shared workspace schedule
-- for booking links scoped to that person. Same jsonb shape as
-- system_settings' business_hours value. No row means "use the workspace
-- default" -- most staff never need this table at all.
create table if not exists public.staff_business_hours (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  hours jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

alter table public.staff_business_hours enable row level security;

-- Mirrors staff_time_off's own policy shape exactly: any active member can
-- see everyone's hours (so booking links resolve correctly and staff can
-- see each other's schedules), but only the person themself or someone with
-- users.manage can write.
create policy staff_business_hours_select on public.staff_business_hours for select using (
  exists (select 1 from public.workspace_users wu where wu.workspace_id = staff_business_hours.workspace_id and wu.user_id = auth.uid() and wu.status = 'active')
);
create policy staff_business_hours_insert on public.staff_business_hours for insert with check (
  exists (select 1 from public.workspace_users wu where wu.workspace_id = staff_business_hours.workspace_id and wu.user_id = auth.uid() and wu.status = 'active')
  and (user_id = auth.uid() or public.has_permission(workspace_id, 'users.manage'))
);
create policy staff_business_hours_update on public.staff_business_hours for update using (
  user_id = auth.uid() or public.has_permission(workspace_id, 'users.manage')
) with check (
  user_id = auth.uid() or public.has_permission(workspace_id, 'users.manage')
);
create policy staff_business_hours_delete on public.staff_business_hours for delete using (
  user_id = auth.uid() or public.has_permission(workspace_id, 'users.manage')
);

-- Multiple offices/locations, each with their own hours and (optionally) a
-- timezone override -- a service assigned to one uses that location's
-- schedule instead of the workspace default. Falls back to the workspace's
-- own timezone when a location doesn't set its own.
create table if not exists public.booking_locations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  address text,
  timezone text,
  hours jsonb not null,
  is_default boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.booking_locations enable row level security;

create policy booking_locations_select on public.booking_locations for select using (
  exists (select 1 from public.workspace_users wu where wu.workspace_id = booking_locations.workspace_id and wu.user_id = auth.uid() and wu.status = 'active')
);
create policy booking_locations_write on public.booking_locations for insert with check (public.is_workspace_admin(workspace_id));
create policy booking_locations_update on public.booking_locations for update using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy booking_locations_delete on public.booking_locations for delete using (public.is_workspace_admin(workspace_id));

create index booking_locations_workspace_id_idx on public.booking_locations(workspace_id);

-- Per-service overrides for the three workspace-wide booking rules --
-- null means "inherit the workspace default" (system_settings), same
-- nullable-override convention already used for season_start/season_end/
-- allowed_weekdays on this table.
alter table public.services add column if not exists booking_min_notice_hours_override integer;
alter table public.services add column if not exists booking_buffer_minutes_override integer;
alter table public.services add column if not exists booking_window_days_override integer;
alter table public.services add column if not exists booking_location_id uuid references public.booking_locations(id) on delete set null;
