-- Same failure mode as the pipeline/process-stage deletes, for the rest of
-- the object types automation_steps.action_config and automations.trigger_config
-- can reference by a raw id/slug with no FK behind it: email templates, sms
-- templates, organizer templates, engagement letter templates, document
-- request templates, and one automation's start_workflow step targeting
-- another automation. Email/sms templates and the automation-targets-
-- automation case are hard-deleted today from the frontend
-- (EmailSmsTemplateGallery.tsx, WorkflowList.tsx) with zero guard --
-- organizer/engagement-letter/document-request templates have no live
-- automation references yet, but the same hard-delete-with-no-guard gap
-- exists for them too, and validate_automation already anticipates those
-- action_config keys, so it's a matter of when, not if.
--
-- One reusable BEFORE DELETE trigger function, parameterized by which
-- jsonb key to match and whether the compared value is the row's id or its
-- slug, so it works as a trigger on any of these tables without a fork per
-- table -- and it protects every delete path, not just the ones that exist
-- today (a raw .delete() call added later is covered automatically).
create or replace function public.guard_delete_if_wired_to_automation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key text := TG_ARGV[0];
  v_compare_slug boolean := TG_ARGV[1] = 'slug';
  v_value text;
  v_names text;
begin
  if v_compare_slug then
    v_value := old.slug;
  else
    v_value := old.id::text;
  end if;

  select string_agg(distinct a.name, ', ')
    into v_names
  from automations a
  left join automation_steps s on s.automation_id = a.id
  where (a.trigger_config ->> v_key) = v_value
     or (s.action_config ->> v_key) = v_value;

  if v_names is not null then
    raise exception 'this is still wired into automation(s): %. update or remove those steps first', v_names;
  end if;

  return old;
end;
$function$;

create trigger trg_guard_delete_email_template
  before delete on public.email_templates
  for each row execute function public.guard_delete_if_wired_to_automation('template_slug', 'slug');

create trigger trg_guard_delete_sms_template
  before delete on public.sms_templates
  for each row execute function public.guard_delete_if_wired_to_automation('template_slug', 'slug');

create trigger trg_guard_delete_automation
  before delete on public.automations
  for each row execute function public.guard_delete_if_wired_to_automation('automation_id', 'id');

create trigger trg_guard_delete_organizer_template
  before delete on public.organizer_templates
  for each row execute function public.guard_delete_if_wired_to_automation('organizer_template_id', 'id');

create trigger trg_guard_delete_engagement_letter_template
  before delete on public.engagement_letter_templates
  for each row execute function public.guard_delete_if_wired_to_automation('engagement_letter_template_id', 'id');

create trigger trg_guard_delete_document_request_template
  before delete on public.document_request_templates
  for each row execute function public.guard_delete_if_wired_to_automation('document_request_template_id', 'id');
