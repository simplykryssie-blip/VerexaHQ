-- New "business hours" concept for New Leads Enter CRM's escalation clock
-- (per the owner: "escalate if staff hasn't acted in 24 business hours").
-- Nothing like this exists yet -- the wait_until_date_or_condition_delay_modes
-- migration explicitly called this out as future work ("a dynamic ... mode
-- belongs with the future business-hours due-date engine, not duplicated
-- here"). This is that engine's first piece: a per-workspace weekly
-- schedule plus a function that walks it forward from a starting instant
-- to compute when N hours of business-open time will have elapsed.

create table public.workspace_business_hours (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday .. 6 = Saturday, matching extract(dow from ...)
  is_open boolean not null default true,
  open_time time not null default '09:00',
  close_time time not null default '17:00',
  updated_at timestamptz not null default now(),
  primary key (workspace_id, day_of_week),
  constraint workspace_business_hours_open_before_close check (not is_open or open_time < close_time)
);

alter table public.workspace_business_hours enable row level security;

create policy workspace_business_hours_select on public.workspace_business_hours
  for select
  using (exists (
    select 1 from public.workspace_users wu
    where wu.workspace_id = workspace_business_hours.workspace_id and wu.user_id = auth.uid() and wu.status = 'active'
  ));
-- No insert/update/delete policy -- writes go through set_workspace_business_hours only.

-- Default Mon-Fri 9-5 for every workspace that already exists, so the
-- escalation clock has something sane to compute against immediately;
-- new workspaces get the same default via seed_default_business_hours
-- below, called from create_workspace.
insert into public.workspace_business_hours (workspace_id, day_of_week, is_open, open_time, close_time)
select w.id, d.dow, d.dow between 1 and 5, '09:00', '17:00'
from public.workspaces w
cross join (select generate_series(0, 6) as dow) d
on conflict (workspace_id, day_of_week) do nothing;

create or replace function public.seed_default_business_hours(p_workspace_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into public.workspace_business_hours (workspace_id, day_of_week, is_open, open_time, close_time)
  select p_workspace_id, d, d between 1 and 5, '09:00', '17:00'
  from generate_series(0, 6) as d
  on conflict (workspace_id, day_of_week) do nothing;
$function$;

revoke all on function public.seed_default_business_hours(uuid) from public, anon, authenticated;
grant execute on function public.seed_default_business_hours(uuid) to service_role;

create or replace function public.set_workspace_business_hours(p_workspace_id uuid, p_hours jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_day jsonb;
begin
  if not has_permission(p_workspace_id, 'settings.manage') then
    raise exception 'Not authorized to manage business hours for this workspace';
  end if;

  for v_day in select * from jsonb_array_elements(p_hours)
  loop
    update public.workspace_business_hours
    set is_open = coalesce((v_day->>'is_open')::boolean, true),
        open_time = coalesce((v_day->>'open_time')::time, '09:00'),
        close_time = coalesce((v_day->>'close_time')::time, '17:00'),
        updated_at = now()
    where workspace_id = p_workspace_id and day_of_week = (v_day->>'day_of_week')::smallint;
  end loop;
end;
$function$;

revoke all on function public.set_workspace_business_hours(uuid, jsonb) from public, anon;
grant execute on function public.set_workspace_business_hours(uuid, jsonb) to authenticated;

-- Walks forward from p_start in the workspace's own timezone, day by day,
-- accumulating open business time against workspace_business_hours until
-- p_hours_needed has elapsed, and returns the resulting instant. Falls back
-- to a flat p_start + p_hours_needed if the workspace has no business-hours
-- rows at all (shouldn't happen given the backfill/seed above, but avoids
-- ever looping without making progress). Capped at 90 days out as a guard
-- against a workspace with every day closed.
create or replace function public.compute_business_hours_deadline(p_workspace_id uuid, p_start timestamptz, p_hours_needed numeric)
returns timestamptz
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_tz text;
  v_remaining numeric := p_hours_needed;
  v_cursor_local timestamp;
  v_day_date date;
  v_dow smallint;
  v_row record;
  v_window_start timestamp;
  v_window_end timestamp;
  v_window_hours numeric;
  v_days_walked int := 0;
  v_has_any_hours boolean;
begin
  select timezone into v_tz from public.workspaces where id = p_workspace_id;
  v_tz := coalesce(nullif(v_tz, ''), 'America/New_York');

  select exists(select 1 from public.workspace_business_hours where workspace_id = p_workspace_id and is_open) into v_has_any_hours;
  if not v_has_any_hours then
    return p_start + make_interval(hours => p_hours_needed);
  end if;

  v_cursor_local := p_start at time zone v_tz;

  while v_remaining > 0 and v_days_walked < 90 loop
    v_day_date := v_cursor_local::date;
    v_dow := extract(dow from v_day_date);

    select * into v_row from public.workspace_business_hours
    where workspace_id = p_workspace_id and day_of_week = v_dow;

    if v_row.is_open then
      v_window_start := greatest(v_cursor_local, v_day_date + v_row.open_time);
      v_window_end := v_day_date + v_row.close_time;

      if v_window_end > v_window_start then
        v_window_hours := extract(epoch from (v_window_end - v_window_start)) / 3600.0;
        if v_window_hours >= v_remaining then
          return (v_window_start + make_interval(hours => v_remaining)) at time zone v_tz;
        end if;
        v_remaining := v_remaining - v_window_hours;
      end if;
    end if;

    v_cursor_local := (v_day_date + 1);
    v_days_walked := v_days_walked + 1;
  end loop;

  return v_cursor_local at time zone v_tz;
end;
$function$;

revoke all on function public.compute_business_hours_deadline(uuid, timestamptz, numeric) from public, anon, authenticated;
grant execute on function public.compute_business_hours_deadline(uuid, timestamptz, numeric) to service_role;
