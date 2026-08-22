-- Gap #1 from the GHL capability audit: nothing stopped the same client (or
-- engagement) from having two concurrent 'running' automation_runs for the
-- SAME automation. If a trigger fired twice for the same entity (a real
-- possibility -- e.g. re-entering a pipeline stage twice, or a duplicate
-- webhook/event), staff got duplicate tasks and clients got duplicate
-- emails/texts, silently.
--
-- A plain unique constraint would be the standard fix, but automation_runs
-- is inserted into from ~30 separate trigger functions across many
-- migrations. Retrofitting all of them to handle a conflict is a large,
-- error-prone surface for no extra benefit -- a BEFORE INSERT guard on the
-- table itself closes the gap in one place, silently skipping the
-- duplicate insert (returns null from a BEFORE INSERT trigger) rather than
-- raising an error that could abort whatever business transaction
-- triggered it.
--
-- Dedupe key is coalesce(engagement_id, client_id): an engagement-scoped
-- automation dedupes per engagement (so the same client's two different
-- engagements can each run it independently, correctly), a lead/client-
-- scoped automation dedupes per client.
create or replace function public.skip_duplicate_active_automation_run()
returns trigger
language plpgsql
as $function$
begin
  if new.status = 'running'
     and coalesce(new.engagement_id, new.client_id) is not null
     and exists (
       select 1 from public.automation_runs
       where automation_id = new.automation_id
         and status = 'running'
         and coalesce(engagement_id, client_id) = coalesce(new.engagement_id, new.client_id)
     )
  then
    return null;
  end if;
  return new;
end;
$function$;

drop trigger if exists prevent_duplicate_active_automation_run on public.automation_runs;
create trigger prevent_duplicate_active_automation_run
  before insert on public.automation_runs
  for each row
  execute function public.skip_duplicate_active_automation_run();
