-- Security hardening: pin search_path on this trigger function so it can't
-- be redirected by a session-level search_path change. No behavior change.
create or replace function public.enforce_automation_status_enabled()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.status in ('draft', 'archived') then
    new.is_enabled := false;
  end if;
  return new;
end;
$function$;
