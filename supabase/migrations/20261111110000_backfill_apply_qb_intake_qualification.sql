-- Source-of-truth backfill. NOT a functional change -- this function and
-- its trigger already exist, byte-for-byte, in production; they were
-- never captured by any CREATE FUNCTION / CREATE TRIGGER statement in
-- this repository's migrations (confirmed via full migration-history and
-- repo-wide search during the SECURITY DEFINER authorization audit).
-- Staging independently acquired a comment-stripped copy of the function
-- body at some point (identical executable logic, confirmed via a full
-- line-by-line diff -- only the explanatory comments differ) and already
-- has the correctly-defined trigger.
--
-- This migration recreates both from production's authoritative,
-- fully-commented body so a fresh environment built from these
-- migrations no longer silently loses this object. No grants are
-- touched -- grant behavior for this function is explicitly out of
-- scope for this migration.
--
-- Trigger: AFTER INSERT OR UPDATE on organizer_responses, fires only for
-- the "QuickBooks Setup & Bookkeeping Consultation" organizer template
-- (a5000000-0000-0000-0000-000000000001) on the transition into
-- status='submitted'; mirrors the submitted answers onto the client's
-- custom_fields, applies lead-scoring tags, and files one or two
-- internal tasks. Belongs to the MKB Financial Group workspace.
CREATE OR REPLACE FUNCTION public.apply_qb_intake_qualification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_template_id constant uuid := 'a5000000-0000-0000-0000-000000000001';
  v_answers jsonb;
  v_tags text[] := '{}';
  v_is_hot boolean := false;
  v_is_warm boolean := false;
  v_is_self boolean := false;
  v_is_cleanup boolean := false;
  v_is_catchup boolean := false;
  v_is_complex boolean := false;
  v_employee_count numeric;
  v_contractor_count numeric;
begin
  if NEW.organizer_template_id is distinct from v_template_id or NEW.status is distinct from 'submitted' then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and OLD.status = 'submitted' then
    return NEW; -- only run once, on the transition into submitted
  end if;
  if NEW.client_id is null then
    return NEW;
  end if;

  select jsonb_object_agg(ofld.id::text, a.value) into v_answers
  from public.organizer_response_answers a
  join public.organizer_fields ofld on ofld.id = a.organizer_field_id
  where a.organizer_response_id = NEW.id and a.instance_index = 0;

  v_answers := coalesce(v_answers, '{}'::jsonb);

  -- Mirror the qualifying answers onto the client's custom fields, keyed the
  -- same way the build spec names them.
  update public.clients set custom_fields = custom_fields || jsonb_build_object('quickbooks_intake', jsonb_build_object(
    'business_entity', v_answers->>'a6000006-0000-0000-0000-000000000000',
    'business_start_date', v_answers->>'a6000008-0000-0000-0000-000000000000',
    'practice_open_date', v_answers->>'a6000009-0000-0000-0000-000000000000',
    'practice_services', v_answers->>'a600000d-0000-0000-0000-000000000000',
    'accepts_insurance', v_answers->>'a600000f-0000-0000-0000-000000000000',
    'payment_methods', v_answers->>'a6000010-0000-0000-0000-000000000000',
    'uses_ehr', v_answers->>'a6000013-0000-0000-0000-000000000000',
    'ehr_system', v_answers->>'a6000014-0000-0000-0000-000000000000',
    'ehr_handles_billing', v_answers->>'a6000015-0000-0000-0000-000000000000',
    'has_quickbooks', v_answers->>'a6000017-0000-0000-0000-000000000000',
    'quickbooks_plan', v_answers->>'a6000018-0000-0000-0000-000000000000',
    'qbo_transactions_entered', v_answers->>'a600001a-0000-0000-0000-000000000000',
    'qbo_bank_connected', v_answers->>'a600001b-0000-0000-0000-000000000000',
    'qbo_credit_cards_connected', v_answers->>'a600001c-0000-0000-0000-000000000000',
    'business_checking', v_answers->>'a600001e-0000-0000-0000-000000000000',
    'business_savings', v_answers->>'a600001f-0000-0000-0000-000000000000',
    'business_credit_card', v_answers->>'a6000020-0000-0000-0000-000000000000',
    'business_loans', v_answers->>'a6000021-0000-0000-0000-000000000000',
    'personal_business_separation', v_answers->>'a6000022-0000-0000-0000-000000000000',
    'bookkeeping_current_owner', v_answers->>'a6000025-0000-0000-0000-000000000000',
    'bookkeeping_frequency', v_answers->>'a6000026-0000-0000-0000-000000000000',
    'last_reconciliation', v_answers->>'a6000027-0000-0000-0000-000000000000',
    'monthly_transaction_volume', v_answers->>'a6000028-0000-0000-0000-000000000000',
    'books_need_cleanup', v_answers->>'a6000029-0000-0000-0000-000000000000',
    'cleanup_months', v_answers->>'a600002a-0000-0000-0000-000000000000',
    'cleanup_transaction_volume', v_answers->>'a600002b-0000-0000-0000-000000000000',
    'has_employees', v_answers->>'a6000033-0000-0000-0000-000000000000',
    'employee_count', v_answers->>'a6000034-0000-0000-0000-000000000000',
    'uses_contractors', v_answers->>'a6000035-0000-0000-0000-000000000000',
    'contractor_count', v_answers->>'a6000036-0000-0000-0000-000000000000',
    'pays_clinicians', v_answers->>'a6000037-0000-0000-0000-000000000000',
    'wants_bookkeeping_information', v_answers->>'a6000045-0000-0000-0000-000000000000',
    'bookkeeping_preference', v_answers->>'a600002d-0000-0000-0000-000000000000',
    'bookkeeping_services_interest', v_answers->>'a600002e-0000-0000-0000-000000000000',
    'bookkeeping_pain_point', v_answers->>'a600002f-0000-0000-0000-000000000000',
    'desired_bookkeeping_support', v_answers->>'a6000046-0000-0000-0000-000000000000',
    'desired_involvement', v_answers->>'a6000047-0000-0000-0000-000000000000',
    'has_tax_professional', v_answers->>'a600003c-0000-0000-0000-000000000000',
    'tax_preparer_separate', v_answers->>'a600003d-0000-0000-0000-000000000000',
    'consultation_goals', v_answers->>'a6000040-0000-0000-0000-000000000000'
  ))
  where id = NEW.client_id;

  -- Every submission
  v_tags := v_tags || array['QB-CONSULT', 'QB-INTAKE-SUBMITTED'];

  -- QuickBooks status
  if v_answers->>'a6000017-0000-0000-0000-000000000000' = 'no' then
    v_tags := v_tags || array['QB-NEW-SETUP'];
  elsif v_answers->>'a6000017-0000-0000-0000-000000000000' = 'yes' then
    v_tags := v_tags || array['QB-EXISTING'];
  end if;

  -- Bookkeeping lead score. Every leaf comparison is coalesced to false --
  -- an unanswered field compares to NULL (unknown), and NULL propagating
  -- through these OR/AND chains would silently turn a should-be-false
  -- result into NULL, which "not v_is_hot and ..." then treats as neither
  -- true nor false and every branch below it goes untagged.
  v_is_hot := coalesce(v_answers->>'a6000045-0000-0000-0000-000000000000' = 'yes', false)
    or coalesce(v_answers->>'a600002d-0000-0000-0000-000000000000' = 'professional_manage', false)
    or coalesce(v_answers->>'a600002f-0000-0000-0000-000000000000' = 'want_someone_else_to_handle_it', false);
  v_is_warm := not v_is_hot and (
    coalesce(v_answers->>'a6000045-0000-0000-0000-000000000000' = 'maybe', false)
    or coalesce(v_answers->>'a600002d-0000-0000-0000-000000000000' = 'guidance', false)
  );
  v_is_self := not v_is_hot and not v_is_warm
    and coalesce(v_answers->>'a6000045-0000-0000-0000-000000000000' = 'no', false)
    and coalesce(v_answers->>'a600002d-0000-0000-0000-000000000000' = 'self_manage', false);

  if v_is_hot then
    v_tags := v_tags || array['BOOKKEEPING-HOT'];
  elsif v_is_warm then
    v_tags := v_tags || array['BOOKKEEPING-WARM'];
  elsif v_is_self then
    v_tags := v_tags || array['BOOKKEEPING-SELF'];
  end if;

  -- Cleanup tags
  v_is_cleanup := coalesce(v_answers->>'a6000029-0000-0000-0000-000000000000' = 'yes', false);
  v_is_catchup := coalesce(v_answers->>'a600002a-0000-0000-0000-000000000000' in ('6_12_months', 'more_than_12_months'), false);
  if v_is_cleanup then
    v_tags := v_tags || array['QB-CLEANUP'];
  end if;
  if v_is_catchup then
    v_tags := v_tags || array['QB-CATCHUP'];
  end if;

  -- Complexity tags
  v_employee_count := nullif(v_answers->>'a6000034-0000-0000-0000-000000000000', '')::numeric;
  v_contractor_count := nullif(v_answers->>'a6000036-0000-0000-0000-000000000000', '')::numeric;
  v_is_complex := coalesce(v_employee_count, 0) > 0
    or coalesce(v_contractor_count, 0) > 0
    or coalesce(v_answers->>'a6000028-0000-0000-0000-000000000000' in ('251_500', '500_plus'), false)
    or v_is_cleanup
    or coalesce((
      select count(*) > 1 from unnest(string_to_array(coalesce(v_answers->>'a6000010-0000-0000-0000-000000000000', ''), ',')) x
    ), false);
  if v_is_complex then
    v_tags := v_tags || array['QB-COMPLEX'];
  else
    v_tags := v_tags || array['QB-STANDARD'];
  end if;

  update public.clients
  set tags = array(select distinct unnest(coalesce(tags, '{}') || v_tags))
  where id = NEW.client_id;

  -- Answer-conditional internal tasks (the generic automations engine has
  -- no primitive that can gate a create_task step on an organizer answer
  -- value, so these two live here instead of in the automation below).
  if v_is_hot then
    insert into public.tasks (workspace_id, client_id, title, description, priority, visibility, related_organizer_response_id)
    values (NEW.workspace_id, NEW.client_id, 'Discuss monthly bookkeeping during consultation',
      'This lead qualified as a hot bookkeeping opportunity. Bring up monthly bookkeeping during the paid consultation -- do not move them to Bookkeeping Opportunity until the consultation actually happens.',
      'high', 'internal', NEW.id);
  end if;

  if v_is_cleanup then
    insert into public.tasks (workspace_id, client_id, title, description, priority, visibility, related_organizer_response_id)
    values (NEW.workspace_id, NEW.client_id, 'Review cleanup scope before consultation',
      'Books need cleanup/catch-up. Review the reported scope (months and transaction volume) before the consultation so pricing can be discussed.',
      'medium', 'internal', NEW.id);
  end if;

  return NEW;
end;
$function$;

-- Idempotent trigger recreation: safe whether or not the trigger already
-- exists (it does, on both staging and production) -- results in exactly
-- one correct trigger either way, without touching any other trigger on
-- this table.
DROP TRIGGER IF EXISTS trg_apply_qb_intake_qualification ON public.organizer_responses;

CREATE TRIGGER trg_apply_qb_intake_qualification
AFTER INSERT OR UPDATE ON public.organizer_responses
FOR EACH ROW EXECUTE FUNCTION public.apply_qb_intake_qualification();
