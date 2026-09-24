-- Automations reconciliation, Phase 6/21: trigger-type validation.
--
-- automations.trigger_type has always been unconstrained text -- the entire
-- trigger vocabulary exists only as a client-side array
-- (components/workflows/TriggerFields.tsx's TRIGGER_TYPES). A typo'd or
-- stale trigger_type (e.g. from a direct API/RPC call, a future rename that
-- forgets to migrate existing rows, or hand-authored test data) can publish
-- and enable successfully today -- it just silently never fires, since
-- every fire_*_automations() trigger function filters on an exact
-- trigger_type match and finds nothing. That's a safe failure mode at
-- runtime (no crash, no wrong automation firing), but it's a silent one:
-- staff have no way to discover "this workflow will never run" before it
-- happens in practice.
--
-- Deliberately not a DB enum/CHECK constraint on automations.trigger_type
-- itself -- that would require a migration every time a trigger is added or
-- renamed, exactly the kind of schema churn this project's own trigger
-- system has avoided by keeping the vocabulary in application code. Instead:
-- a single server-side source of truth function mirroring the client list,
-- consulted by validate_automation (the same pre-publish/pre-activation gate
-- every other per-step config issue already goes through), so an unknown
-- trigger type is caught and surfaced as a normal validation issue instead
-- of publishing successfully and never firing.

create or replace function public.known_automation_trigger_types()
returns text[]
language sql
immutable
as $$
  select array[
    'engagement.status_changed', 'organizer.submitted', 'client.tag_added', 'client.portal_created',
    'client.service_interest_selected', 'engagement.created', 'appointment.status_changed', 'appointment.booked',
    'engagement_letter.signed', 'document_request.completed', 'organizer_information_request.resolved',
    'organizer_response.review_decided', 'engagement.stage_entered', 'lead.created', 'lead.updated',
    'lead.assigned', 'lead.stage_entered', 'lead.status_changed', 'lead.converted_to_client', 'lead.marked_lost',
    'quote.created', 'quote.sent', 'quote.accepted', 'quote.declined', 'document_request.sent', 'document.uploaded',
    'task.created', 'task.completed', 'client_message.received', 'task.overdue', 'webhook.received',
    'engagement.due_date_reminder', 'quote.expiring_reminder', 'client.birthday_reminder', 'email.opened',
    'email.clicked', 'email.bounced', 'sms.delivered', 'sms.failed', 'invoice.sent', 'invoice.paid',
    'invoice.overdue', 'payment_plan.installment_paid', 'engagement_share.created', 'firm_package.purchased',
    'partner_package.purchased', 'firm_package.canceled', 'partner_onboarding.created',
    'partner_onboarding.status_changed'
  ]::text[];
$$;

revoke all on function public.known_automation_trigger_types() from public, anon;
grant execute on function public.known_automation_trigger_types() to authenticated, service_role;

-- validate_automation has been patched forward many times since its last
-- full CREATE OR REPLACE landed in a migration file (20260912160000); rather
-- than re-author its entire ~150-line body from that possibly-stale
-- snapshot and risk silently reverting a live-only fix this project's own
-- history has already shown happens (see 20261101000000's recovery note),
-- this patches the CURRENT live function in place: insert one new trigger-
-- type check immediately after the existing "no trigger configured" check,
-- which is the anchor unlikely to have moved since it's the very first
-- validation the function performs, before any per-step-action-type checks
-- that have been added since. If a future migration ever fully rewrites
-- validate_automation from a fresh CREATE OR REPLACE, carry this check
-- forward explicitly.
do $migration$
declare
  v_def text;
  v_anchor text := $anchor$if v_trigger_type is null or btrim(v_trigger_type) = '' then
    return query select 0, 'trigger'::text, 'Trigger'::text, 'No trigger is configured for this automation.'::text;
  end if;$anchor$;
  v_insert text := $anchor$if v_trigger_type is null or btrim(v_trigger_type) = '' then
    return query select 0, 'trigger'::text, 'Trigger'::text, 'No trigger is configured for this automation.'::text;
  end if;

  if v_trigger_type is not null and btrim(v_trigger_type) <> '' and not (v_trigger_type = any(public.known_automation_trigger_types())) then
    return query select 0, 'trigger'::text, 'Trigger'::text, format('"%s" is not a recognized trigger type -- this workflow will never fire until its trigger is reconfigured.', v_trigger_type)::text;
  end if;$anchor$;
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc
  where proname = 'validate_automation' and pronamespace = 'public'::regnamespace;

  if v_def is null then
    raise exception 'validate_automation not found -- cannot patch trigger-type validation in';
  end if;

  if v_def not like '%' || v_anchor || '%' then
    raise exception 'validate_automation''s body has changed in a way this migration did not expect (anchor not found) -- update this migration''s anchor to match the current function body before re-running';
  end if;

  execute replace(v_def, v_anchor, v_insert);
end;
$migration$;
