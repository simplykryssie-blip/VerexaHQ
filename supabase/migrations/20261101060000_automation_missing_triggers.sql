-- Automations reconciliation, Phase 6/17 (continued): missing triggers.
--
-- Inventory taken directly against the current trigger vocabulary
-- (components/workflows/TriggerFields.tsx's TRIGGER_TYPES, cross-checked
-- against every trg_fire_*_automations trigger in the schema) before adding
-- anything, per instruction. Findings:
--
--   * task.assigned / task.reassigned: genuinely missing. tasks.assigned_staff_id
--     exists (already usable as a *condition* field, "Assigned staff"), but
--     no trigger fires when it changes -- only task.created/task.completed/
--     task.overdue exist. Added below as one trigger function distinguishing
--     the two by whether the task had a prior assignee.
--   * invoice.created: genuinely missing. invoice.sent/invoice.paid/
--     invoice.overdue all exist (fire on UPDATE OF status), but nothing
--     fires on the initial INSERT -- a workflow that wants to react to
--     "any invoice record now exists" (e.g. notify accounting) regardless of
--     draft/sent status has no trigger to use. Added below.
--   * payment.failed: genuinely missing. payments rows are inserted with
--     status='failed' directly by lib/stripe/handleCheckoutCompleted.ts's
--     handlePaymentIntentFailed (a verified Stripe Connect event, not a
--     client-supplied flag), but nothing reacts to it as an automation
--     trigger -- payments_enqueue_receipt/apply_payment_to_invoice both only
--     fire on status='succeeded'. Added below as a first-party DB trigger
--     (this is our own payments table changing state, not a third-party
--     webhook event, so it belongs in the same family as invoice.paid/
--     task.completed, not routed through the webhook infrastructure).
--   * document.reviewed / document.approved / document.rejected: NOT
--     implemented. There is no document-review-decision concept anywhere in
--     the schema to fire from -- attachments has no status/review column,
--     and the one similarly-shaped existing feature
--     (organizer_response.review_decided) is specific to intake FORM
--     responses, not general documents. Adding these would mean inventing a
--     new document-review subsystem (a review-status column, a decision UI,
--     a workflow), which is a genuinely new product decision, not a missing
--     trigger wire-up -- flagged in the final report rather than invented.
--
-- Schema note found while integrating this: 20260927030000_firm_connection_contacts.sql
-- dropped and re-added tasks_engagement_or_client_chk without the
-- partner_prospect_id branch that 20260917134844_partner_purchase_entrypoint_schema.sql
-- had added ten days earlier -- silently regressing the constraint back to
-- 3-way (engagement/client/firm_connection) and dropping partner_prospect_id
-- from it. A task attached to a partner_prospect alone (no engagement,
-- client, or firm_connection -- exactly what create_task's action falls
-- back to for a partner-prospect-only run) would violate this constraint as
-- currently committed. Restored to the full 4-way check below -- required to
-- safely fire task.assigned/task.reassigned for partner-prospect-only tasks
-- without hitting a constraint violation that predates this session's work.

alter table public.tasks drop constraint if exists tasks_engagement_or_client_chk;
alter table public.tasks add constraint tasks_engagement_or_client_chk
  check (engagement_id is not null or client_id is not null or firm_connection_id is not null or partner_prospect_id is not null);

create or replace function public.fire_task_assignment_automations()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_client_id uuid;
  v_event text;
begin
  if new.assigned_staff_id is not distinct from old.assigned_staff_id then
    return new;
  end if;
  if new.assigned_staff_id is null then
    -- Unassignment isn't itself a trigger event here -- only assigned_to
    -- becoming non-null is (matches "task.assigned"/"task.reassigned"
    -- naming: both describe gaining an assignee, not losing one).
    return new;
  end if;

  v_event := case when old.assigned_staff_id is null then 'task.assigned' else 'task.reassigned' end;

  if new.engagement_id is not null then
    select client_id into v_client_id from public.engagements where id = new.engagement_id;
  else
    v_client_id := new.client_id;
  end if;

  v_context := jsonb_build_object(
    'task_id', new.id,
    'title', new.title,
    'priority', new.priority,
    'assigned_staff_id', new.assigned_staff_id,
    'previous_assigned_staff_id', old.assigned_staff_id
  );

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = v_event
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, v_client_id, new.engagement_id, new.firm_connection_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, connection_id, partner_prospect_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, v_client_id, new.firm_connection_id, new.partner_prospect_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

revoke all on function public.fire_task_assignment_automations() from public, anon, authenticated;

drop trigger if exists trg_fire_task_assignment_automations on public.tasks;
create trigger trg_fire_task_assignment_automations after update of assigned_staff_id on public.tasks
  for each row execute function public.fire_task_assignment_automations();

create or replace function public.fire_invoice_created_automations()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  v_context := jsonb_build_object(
    'invoice_id', new.id,
    'invoice_number', new.invoice_number,
    'status', new.status,
    'total_amount', new.total_amount,
    'due_date', new.due_date
  );

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'invoice.created'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.client_id, new.engagement_id, new.firm_connection_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, connection_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, new.client_id, new.firm_connection_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

revoke all on function public.fire_invoice_created_automations() from public, anon, authenticated;

drop trigger if exists trg_fire_invoice_created_automations on public.invoices;
create trigger trg_fire_invoice_created_automations after insert on public.invoices
  for each row execute function public.fire_invoice_created_automations();

create or replace function public.fire_payment_failed_automations()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  if new.status <> 'failed' then
    return new;
  end if;

  v_context := jsonb_build_object(
    'payment_id', new.id,
    'invoice_id', new.invoice_id,
    'amount', new.amount,
    'currency', new.currency,
    'payment_method', new.payment_method,
    'notes', new.notes
  );

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'payment.failed'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.client_id, null, new.firm_connection_id) then
      insert into public.automation_runs (workspace_id, automation_id, client_id, connection_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.client_id, new.firm_connection_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

revoke all on function public.fire_payment_failed_automations() from public, anon, authenticated;

drop trigger if exists trg_fire_payment_failed_automations on public.payments;
create trigger trg_fire_payment_failed_automations after insert on public.payments
  for each row when (new.status = 'failed') execute function public.fire_payment_failed_automations();

-- known_automation_trigger_types() (20261101020000) is the server-side
-- mirror of TriggerFields.tsx's TRIGGER_TYPES -- extend it with the 4 new
-- trigger keys so validate_automation doesn't flag them as unrecognized.
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
    'partner_onboarding.status_changed',
    'task.assigned', 'task.reassigned', 'invoice.created', 'payment.failed'
  ]::text[];
$$;
