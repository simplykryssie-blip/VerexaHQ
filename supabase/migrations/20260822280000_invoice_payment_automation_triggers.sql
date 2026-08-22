-- invoices/payments/payment_plans are real, actively-used tables (Stripe
-- Connect fully wired) with zero automation trigger wiring despite the
-- billing.manage permission existing. Adds four trigger types: invoice.sent,
-- invoice.paid, invoice.overdue, payment_plan.installment_paid.

alter table public.invoices add column overdue_flagged_at timestamptz;

-- invoice.sent / invoice.paid: both are status transitions on an existing
-- row (sync_sent_at already stamps sent_at, apply_payment_to_invoice
-- already flips status to 'paid'/'partially_paid' on a payment) --
-- these two triggers just react to that same status column, same
-- pattern as the existing trg_log_engagement_completed_on_invoice_paid.
create or replace function public.fire_invoice_sent_automations()
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
  if new.status <> 'sent' or old.status is not distinct from 'sent' then
    return new;
  end if;

  v_context := jsonb_build_object('invoice_id', new.id, 'invoice_number', new.invoice_number, 'total_amount', new.total_amount::text);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'invoice.sent'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.client_id, new.engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, new.client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create trigger trg_fire_invoice_sent_automations
  after update of status on public.invoices
  for each row execute function public.fire_invoice_sent_automations();

create or replace function public.fire_invoice_paid_automations()
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
  if new.status <> 'paid' or old.status is not distinct from 'paid' then
    return new;
  end if;

  v_context := jsonb_build_object('invoice_id', new.id, 'invoice_number', new.invoice_number, 'total_amount', new.total_amount::text);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'invoice.paid'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.client_id, new.engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, new.client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create trigger trg_fire_invoice_paid_automations
  after update of status on public.invoices
  for each row execute function public.fire_invoice_paid_automations();

-- payment_plan.installment_paid: an individual installment (not the whole
-- invoice) clears -- distinct from invoice.paid, which only fires once the
-- invoice's full balance is covered.
create or replace function public.fire_payment_plan_installment_paid_automations()
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
  v_engagement_id uuid;
begin
  if new.status <> 'paid' or old.status is not distinct from 'paid' then
    return new;
  end if;

  select client_id, engagement_id into v_client_id, v_engagement_id from public.invoices where id = new.invoice_id;

  v_context := jsonb_build_object('payment_plan_id', new.id, 'invoice_id', new.invoice_id, 'installment_number', new.installment_number, 'amount', new.amount::text);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'payment_plan.installment_paid'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, v_client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create trigger trg_fire_payment_plan_installment_paid_automations
  after update of status on public.payment_plans
  for each row execute function public.fire_payment_plan_installment_paid_automations();

-- invoice.overdue: same dedupe-flag pattern as fire_task_overdue_automations
-- -- fires once per invoice the first time it's found overdue, not on every
-- cron tick. Drafts have no due obligation yet; paid invoices can't be
-- overdue; partially_paid ones still can (balance remains).
create or replace function public.fire_invoice_overdue_automations()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_count int := 0;
begin
  for r in
    select id, workspace_id, client_id, engagement_id, invoice_number, due_date
    from public.invoices
    where status not in ('draft', 'paid')
      and due_date is not null
      and due_date < current_date
      and overdue_flagged_at is null
  loop
    v_context := jsonb_build_object('invoice_id', r.id, 'invoice_number', r.invoice_number, 'due_date', r.due_date::text);

    for v_automation in
      select * from public.automations
      where workspace_id = r.workspace_id and is_enabled = true and status = 'published'
        and trigger_type = 'invoice.overdue'
    loop
      if public.evaluate_automation_conditions(v_automation.conditions, v_context, r.workspace_id, r.client_id, r.engagement_id) then
        insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
        values (r.workspace_id, v_automation.id, r.engagement_id, r.client_id, v_context, 'running')
        returning id into v_run_id;
        perform public.start_next_automation_step(v_run_id);
      end if;
    end loop;

    update public.invoices set overdue_flagged_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;
