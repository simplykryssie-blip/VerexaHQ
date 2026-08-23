-- make_interval(hours => numeric) doesn't exist (hours wants an int) --
-- compute_business_hours_deadline needs fractional hours (a delay step can
-- ask for e.g. 1.5 business hours), so multiply by an interval literal
-- instead, which accepts numeric.
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
    return p_start + (p_hours_needed * interval '1 hour');
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
