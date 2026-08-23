-- The owner already has a real, editable "business hours" setting --
-- Settings -> Firm Profile, stored in system_settings (key='business_hours',
-- shaped per lib/businessHours.ts: {monday: {start,end}|null, ...}) and
-- also driving portal appointment-booking availability. The
-- workspace_business_hours table + set_workspace_business_hours/
-- seed_default_business_hours RPCs built earlier today duplicated this
-- with no UI of their own and nothing pointing at it yet -- dropped
-- outright (never wired into anything real) in favor of reading the
-- existing setting, so there's exactly one place to edit business hours.

drop function if exists public.set_workspace_business_hours(uuid, jsonb);
drop function if exists public.seed_default_business_hours(uuid);
drop table if exists public.workspace_business_hours;

create or replace function public.compute_business_hours_deadline(p_workspace_id uuid, p_start timestamptz, p_hours_needed numeric)
returns timestamptz
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_tz text;
  v_hours jsonb;
  v_remaining numeric := p_hours_needed;
  v_cursor_local timestamp;
  v_day_date date;
  v_dow smallint;
  v_day_names text[] := array['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  v_day jsonb;
  v_window_start timestamp;
  v_window_end timestamp;
  v_window_hours numeric;
  v_days_walked int := 0;
begin
  select timezone into v_tz from public.workspaces where id = p_workspace_id;
  v_tz := coalesce(nullif(v_tz, ''), 'America/New_York');

  select value into v_hours from public.system_settings where workspace_id = p_workspace_id and key = 'business_hours';
  -- Mirrors lib/businessHours.ts's DEFAULT_BUSINESS_HOURS (Mon-Fri 9-5, weekends closed).
  if v_hours is null then
    v_hours := jsonb_build_object(
      'sunday', null, 'saturday', null,
      'monday', jsonb_build_object('start', '09:00', 'end', '17:00'),
      'tuesday', jsonb_build_object('start', '09:00', 'end', '17:00'),
      'wednesday', jsonb_build_object('start', '09:00', 'end', '17:00'),
      'thursday', jsonb_build_object('start', '09:00', 'end', '17:00'),
      'friday', jsonb_build_object('start', '09:00', 'end', '17:00')
    );
  end if;

  v_cursor_local := p_start at time zone v_tz;

  while v_remaining > 0 and v_days_walked < 90 loop
    v_day_date := v_cursor_local::date;
    v_dow := extract(dow from v_day_date);
    v_day := v_hours -> v_day_names[v_dow + 1];

    if v_day is not null and v_day <> 'null'::jsonb then
      v_window_start := greatest(v_cursor_local, v_day_date + (v_day->>'start')::time);
      v_window_end := v_day_date + (v_day->>'end')::time;

      if v_window_end > v_window_start then
        v_window_hours := extract(epoch from (v_window_end - v_window_start)) / 3600.0;
        if v_window_hours >= v_remaining then
          return (v_window_start + (v_remaining * interval '1 hour')) at time zone v_tz;
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
