-- Holidays were a flat array of single 'YYYY-MM-DD' strings -- fine for a
-- one-off closure like Christmas Day, but firms also close for multi-day
-- spans (a week between Christmas and New Year's, a staff retreat, etc.)
-- and had to add every date in the span individually. Widens the stored
-- shape to an array of {start, end} objects (both 'YYYY-MM-DD'; a single-day
-- closure is just start == end) and backfills every existing plain-string
-- entry into that shape so nothing already configured breaks.

update public.system_settings
set value = (
  select coalesce(jsonb_agg(jsonb_build_object('start', elem, 'end', elem)), '[]'::jsonb)
  from jsonb_array_elements_text(value) as elem
)
where key = 'holidays'
  and jsonb_typeof(value) = 'array'
  and not exists (
    select 1 from jsonb_array_elements(value) as elem where jsonb_typeof(elem) = 'object'
  );

create or replace function public.compute_business_hours_deadline(p_workspace_id uuid, p_start timestamp with time zone, p_hours_needed numeric)
 returns timestamp with time zone
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare
  v_tz text;
  v_hours jsonb;
  v_holidays jsonb;
  v_remaining numeric := p_hours_needed;
  v_cursor_local timestamp;
  v_day_date date;
  v_day_str text;
  v_dow smallint;
  v_day_names text[] := array['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  v_day jsonb;
  v_window_start timestamp;
  v_window_end timestamp;
  v_window_hours numeric;
  v_days_walked int := 0;
  v_is_holiday boolean;
begin
  select timezone into v_tz from public.workspaces where id = p_workspace_id;
  v_tz := coalesce(nullif(v_tz, ''), 'America/New_York');

  select value into v_hours from public.system_settings where workspace_id = p_workspace_id and key = 'business_hours';
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

  select value into v_holidays from public.system_settings where workspace_id = p_workspace_id and key = 'holidays';
  v_holidays := coalesce(v_holidays, '[]'::jsonb);

  v_cursor_local := p_start at time zone v_tz;

  while v_remaining > 0 and v_days_walked < 90 loop
    v_day_date := v_cursor_local::date;
    v_dow := extract(dow from v_day_date);
    v_day := v_hours -> v_day_names[v_dow + 1];
    v_day_str := to_char(v_day_date, 'YYYY-MM-DD');

    select exists (
      select 1 from jsonb_array_elements(v_holidays) as h
      where v_day_str between (h->>'start') and (h->>'end')
    ) into v_is_holiday;

    if v_is_holiday then
      v_day := null;
    end if;

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
