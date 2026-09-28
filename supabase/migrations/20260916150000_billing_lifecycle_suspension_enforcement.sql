-- Billing workstream completion: lifecycle fields (suspended_at/archived_at/
-- permanently_archived_at + a new 'permanently_archived' status), extends
-- the existing is_workspace_operational() suspension gate (previously only
-- enforced via RLS on staff mutations -- see 20261016000000/20261017000000)
-- to two places that run entirely as service_role and so never went through
-- RLS at all: the automation execution engine and the client portal's
-- previously-deliberate suspension carve-out (that carve-out is now
-- reversed per explicit new product direction -- see the comment on each
-- policy below). Also closes two usage-billing gaps (auto top-up, phone
-- rental) that could otherwise keep charging/deducting from a suspended
-- workspace, and marks the two known non-billable internal workspaces so
-- the billing engine and admin account list never treat them as customers.

-- ============================================================
-- Lifecycle fields
-- ============================================================
alter table public.workspaces
  add column suspended_at timestamptz,
  add column archived_at timestamptz,
  add column permanently_archived_at timestamptz,
  add column is_billing_exempt boolean not null default false;

comment on column public.workspaces.is_billing_exempt is
  'True for Verexa-internal/owner workspaces (e.g. Verexa HQ itself, staff''s own personal tax practice) that must never be treated as a paying customer -- independent of workspace_type, which alone cannot distinguish a real Service Bureau customer from an internal account of the same type.';

alter table public.workspaces drop constraint workspaces_status_check;
alter table public.workspaces add constraint workspaces_status_check
  check (status = any (array['active', 'suspended', 'archived', 'permanently_archived']));

alter table public.workspace_usage_ledger drop constraint workspace_usage_ledger_entry_type_check;
alter table public.workspace_usage_ledger add constraint workspace_usage_ledger_entry_type_check
  check (entry_type = any (array[
    'FREE_ALLOWANCE_GRANTED', 'FREE_ALLOWANCE_CONSUMED', 'PREPAID_TOPUP', 'USAGE_CHARGE',
    'USAGE_RESERVATION_REFUND', 'SMS_MONTHLY_RENTAL', 'AUTO_TOPUP_FAILED', 'ARCHIVE_FORFEITURE'
  ]));

-- Backfill deliberately NOT performed for the one workspace already
-- status='suspended' today (the disposable payment-first-recovery test
-- fixture, 58b5f460-...) -- it has no real suspended_at, so it is simply
-- never archive-eligible under the new day-30/90 cron below. That's the
-- correct, safe default for a workspace this migration has no real
-- suspension start time for, and it is explicitly not to be modified.

-- ============================================================
-- Internal/demo billing safety: MKB Financial Group (the account owner's
-- own personal tax practice) and Verexa HQ CRM (the platform's own home
-- workspace, already excluded from get_platform_account_holders via
-- is_platform_home) are not Verexa customers and must never be billed.
-- ============================================================
update public.workspaces
set is_billing_exempt = true
where id in (
  '2896bf43-95db-420f-9bb5-8854f537bbd1', -- MKB Financial Group
  '74321fb2-9a18-4625-ab12-01c98e888667'  -- Verexa HQ CRM
);

-- MKB's workspace_subscriptions row is leftover from the trial system
-- removed in 20260925010000_remove_trial_require_paid_signup (stripe_status
-- 'trialing' with a 14-day period, matching that era exactly) -- it has no
-- stripe_customer_id/stripe_subscription_id, so it was never real Stripe
-- billing and check-billing-cycles' own query already ignores it (it
-- requires both Stripe ids to be non-null). The only real risk it poses is
-- misrepresenting MKB as an active paying customer in any future admin
-- billing view. The `and stripe_customer_id is null and stripe_subscription_id
-- is null` guard means this can only ever delete a row with zero real Stripe
-- backing -- never a genuine subscription.
delete from public.workspace_subscriptions
where workspace_id = '2896bf43-95db-420f-9bb5-8854f537bbd1'
  and stripe_customer_id is null
  and stripe_subscription_id is null;

-- get_platform_account_holders already excludes is_demo/is_platform_home;
-- extend the same exclusion to is_billing_exempt so MKB (workspace_type
-- independent_ptin, is_demo=false, is_platform_home=false -- indistinguishable
-- from a real customer by those columns alone) no longer appears as one.
CREATE OR REPLACE FUNCTION public.get_platform_account_holders()
 RETURNS TABLE(workspace_id uuid, workspace_name text, workspace_type text, workspace_status text, workspace_created_at timestamp with time zone, user_id uuid, display_name text, first_name text, last_name text, email text, phone text, plan_name text, stripe_status text, seat_count integer, current_period_end timestamp with time zone, cancel_at_period_end boolean, last_payment_amount_cents integer, last_payment_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    w.id,
    w.name,
    w.workspace_type,
    w.status,
    w.created_at,
    wu.user_id,
    up.display_name,
    up.first_name,
    up.last_name,
    au.email,
    up.phone,
    pp.name,
    ws.stripe_status,
    ws.seat_count,
    ws.current_period_end,
    ws.cancel_at_period_end,
    lp.amount_paid,
    lp.paid_at
  from public.workspaces w
  join public.workspace_users wu on wu.workspace_id = w.id and wu.is_owner = true and wu.status = 'active'
  join public.user_profiles up on up.id = wu.user_id
  join auth.users au on au.id = wu.user_id
  left join public.workspace_subscriptions ws on ws.workspace_id = w.id
  left join public.platform_subscription_plans pp on pp.id = ws.plan_id
  left join lateral (
    select amount_paid, paid_at
    from public.workspace_subscription_invoices wsi
    where wsi.workspace_id = w.id and wsi.status = 'paid'
    order by wsi.paid_at desc nulls last
    limit 1
  ) lp on true
  where w.is_demo = false
    and w.is_platform_home = false
    and w.is_billing_exempt = false
    and public.is_platform_admin()
  order by w.created_at desc;
$function$;

-- ============================================================
-- Usage-billing suspension gating: a workspace must be status='active' to
-- receive normal service -- an automatic usage top-up charge or a phone
-- rental deduction/pause cycle is exactly that. Both previously keyed only
-- off workspace_subscriptions.stripe_status (auto top-up) or nothing at all
-- (phone billing), which is not the same thing during the window where
-- workspaces.status has already flipped to 'suspended'/'archived' but
-- stripe_status hasn't caught up (or never diverges, for phone billing).
-- ============================================================
CREATE OR REPLACE FUNCTION public.find_workspaces_needing_auto_topup()
 RETURNS TABLE(workspace_id uuid, resource_type text, amount_cents integer, stripe_customer_id text, default_payment_method_id text, rate_cents integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    m.workspace_id,
    m.resource_type,
    m.auto_topup_amount_cents,
    ws.stripe_customer_id,
    ws.default_payment_method_id,
    case m.resource_type
      when 'email' then p.email_overage_rate_cents_per_1000
      when 'sms' then p.sms_overage_rate_cents
      when 'storage' then p.storage_overage_rate_cents
    end as rate_cents
  from public.workspace_usage_meters m
  join public.workspace_subscriptions ws on ws.workspace_id = m.workspace_id
  join public.platform_subscription_plans p on p.id = ws.plan_id
  join public.workspaces w on w.id = m.workspace_id
  where m.auto_topup_enabled
    and m.auto_topup_amount_cents is not null
    and ws.stripe_status = 'active'
    and w.status = 'active'
    and ws.stripe_customer_id is not null
    and ws.default_payment_method_id is not null
    and (
      (m.resource_type in ('email', 'sms') and (m.free_units_granted - m.free_units_consumed) + m.prepaid_balance <= 0)
      or
      (m.resource_type = 'storage' and (m.free_units_granted + m.prepaid_balance) * 1073741824 <= (
        select coalesce(sum(a.file_size_bytes), 0) from public.attachments a where a.workspace_id = m.workspace_id and a.is_archived = false
      ))
    );
$function$;

CREATE OR REPLACE FUNCTION public.bill_and_pause_phone_numbers(p_workspace_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(workspace_id uuid, phone_number text, result text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ws record;
  v_num record;
  v_meter record;
  v_rate_cents integer;
  v_units_needed numeric;
begin
  for v_ws in
    select distinct wpn.workspace_id
    from public.workspace_phone_numbers wpn
    join public.workspaces w on w.id = wpn.workspace_id
    where wpn.is_free = false
      and w.status = 'active'
      and (wpn.last_billed_at is null or wpn.last_billed_at <= now() - interval '1 month')
      and (p_workspace_id is null or wpn.workspace_id = p_workspace_id)
  loop
    select p.sms_overage_rate_cents into v_rate_cents
    from public.workspace_subscriptions ws
    join public.platform_subscription_plans p on p.id = ws.plan_id
    where ws.workspace_id = v_ws.workspace_id;

    if v_rate_cents is null or v_rate_cents <= 0 then
      continue;
    end if;
    v_units_needed := 499.0 / v_rate_cents;

    select * into v_meter
    from public.workspace_usage_meters
    where workspace_id = v_ws.workspace_id and resource_type = 'sms'
    for update;

    if not found then
      continue;
    end if;

    for v_num in
      select *
      from public.workspace_phone_numbers
      where workspace_id = v_ws.workspace_id
        and is_free = false
        and (last_billed_at is null or last_billed_at <= now() - interval '1 month')
      order by created_at asc
    loop
      if v_meter.prepaid_balance >= v_units_needed then
        update public.workspace_usage_meters
        set prepaid_balance = prepaid_balance - v_units_needed, updated_at = now()
        where id = v_meter.id;
        v_meter.prepaid_balance := v_meter.prepaid_balance - v_units_needed;

        insert into public.workspace_usage_ledger (workspace_id, resource_type, entry_type, units, metadata)
        values (v_ws.workspace_id, 'sms', 'SMS_MONTHLY_RENTAL', -v_units_needed, jsonb_build_object('phone_number', v_num.phone_number, 'amount_cents', 499));

        update public.workspace_phone_numbers
        set status = 'active', last_billed_at = now()
        where id = v_num.id;

        workspace_id := v_num.workspace_id;
        phone_number := v_num.phone_number;
        result := 'billed';
        return next;
      else
        update public.workspace_phone_numbers
        set status = 'paused'
        where id = v_num.id;

        workspace_id := v_num.workspace_id;
        phone_number := v_num.phone_number;
        result := 'paused';
        return next;
      end if;
    end loop;
  end loop;
end;
$function$;

-- ============================================================
-- Automation engine: both entry points into step execution run entirely as
-- service_role (a cron calling the RPC directly), so they never went
-- through the RLS-layer is_workspace_operational() checks added for staff
-- mutations in 20261016000000/20261017000000. This adds the exact same
-- check as those migrations, right alongside each function's existing
-- "is this run still running" guard -- no condition-evaluation, branch-
-- matching, retry_until_matched, or other workflow-engine business logic is
-- touched; a non-operational workspace's run simply isn't advanced this
-- tick and resumes exactly where it left off once the workspace is active
-- again.
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_next_automation_step(p_run_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run record;
  v_edge record;
  v_next_step_id uuid;
  v_next record;
  v_matched boolean;
  v_has_edges boolean;
  v_current_step_id uuid;
  v_current_step record;
  v_loop_guard int := 0;
  v_wait_mode text;
  v_scheduled_for timestamptz;
  v_approver record;
  v_approval_message text;
  v_retry_started_at timestamptz;
  v_retry_timeout_days int;
begin
  select * into v_run from public.automation_runs where id = p_run_id;
  if v_run.status <> 'running' then
    return;
  end if;

  if not public.is_workspace_operational(v_run.workspace_id) then
    return;
  end if;

  v_current_step_id := v_run.current_step_id;

  loop
    v_loop_guard := v_loop_guard + 1;
    if v_loop_guard > 200 then
      insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, error_message, executed_at)
      values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'failed',
        jsonb_build_object('run_id', p_run_id, 'step_id', v_current_step_id),
        'This workflow''s branches form a loop that never reaches an action step (possible cycle). Stopped after 200 steps to avoid running forever.',
        now());
      update public.automation_runs set status = 'failed', completed_at = now() where id = p_run_id;
      return;
    end if;

    if v_current_step_id is null then
      select s.id into v_next_step_id
      from public.automation_steps s
      where s.automation_id = v_run.automation_id
        and not exists (select 1 from public.automation_step_edges e where e.to_step_id = s.id)
      order by s.display_order asc
      limit 1;

      if v_next_step_id is null then
        update public.automation_runs set status = 'completed', completed_at = now() where id = p_run_id;
        return;
      end if;
    else
      v_matched := false;
      v_next_step_id := null;
      for v_edge in
        select * from public.automation_step_edges
        where from_step_id = v_current_step_id
        order by sort_order asc
      loop
        if v_edge.branch_conditions is null
           or public.evaluate_automation_conditions(v_edge.branch_conditions, v_run.trigger_snapshot, v_run.workspace_id, v_run.client_id, v_run.engagement_id)
        then
          v_next_step_id := v_edge.to_step_id;
          v_matched := true;
          exit;
        end if;
      end loop;

      if not v_matched then
        select exists(select 1 from public.automation_step_edges where from_step_id = v_current_step_id) into v_has_edges;

        if v_has_edges then
          select * into v_current_step from public.automation_steps where id = v_current_step_id;

          if v_current_step.action_type = 'condition' and coalesce((v_current_step.action_config->>'retry_until_matched')::boolean, false) then
            select created_at into v_retry_started_at
            from public.automation_pending_steps
            where run_id = p_run_id and automation_step_id = v_current_step_id
            order by created_at asc limit 1;

            v_retry_timeout_days := coalesce(nullif(v_current_step.action_config->>'retry_timeout_days', '')::int, 90);

            if v_retry_started_at is null or v_retry_started_at > now() - make_interval(days => v_retry_timeout_days) then
              if v_retry_started_at is null then
                insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
                values (v_run.workspace_id, p_run_id, v_current_step_id, 'pending_delay', now());
              end if;
              return;
            end if;
            -- retry window exhausted -- fall through to the normal dead-end below
          end if;

          insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
          values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
            jsonb_build_object('run_id', p_run_id, 'step_id', v_current_step_id, 'dead_end', true, 'reason', 'no branch matched and no default edge'),
            now());
        end if;
        update public.automation_runs set status = 'completed', completed_at = now() where id = p_run_id;
        return;
      end if;

      if v_next_step_id is null then
        insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
        values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
          jsonb_build_object('run_id', p_run_id, 'step_id', v_current_step_id, 'unwired_branch', true, 'reason', 'the matching branch has not been connected to a next step yet'),
          now());
        update public.automation_runs set status = 'completed', completed_at = now() where id = p_run_id;
        return;
      end if;
    end if;

    select * into v_next from public.automation_steps where id = v_next_step_id;
    update public.automation_runs set current_step_id = v_next_step_id where id = p_run_id;

    if v_next.action_type <> 'condition' and v_next.is_enabled = false then
      insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
      values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
        jsonb_build_object('run_id', p_run_id, 'step_id', v_next.id, 'action_type', v_next.action_type, 'skipped_disabled', true), now());
      v_current_step_id := v_next_step_id;
      continue;
    end if;

    if v_next.action_type = 'condition' and v_next.delay_minutes = 0 then
      insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
      values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
        jsonb_build_object('run_id', p_run_id, 'step_id', v_next.id, 'action_type', 'condition'), now());
      v_current_step_id := v_next_step_id;
      continue;
    end if;

    v_wait_mode := case when v_next.action_type = 'delay' then coalesce(v_next.action_config->>'wait_mode', 'duration') else 'duration' end;

    if v_next.requires_approval then
      insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status)
      values (v_run.workspace_id, p_run_id, v_next.id, 'pending_approval');

      v_approval_message := coalesce(nullif(v_next.display_name, ''), initcap(replace(v_next.action_type, '_', ' '))) || ' needs your approval before it runs';

      for v_approver in
        select wu.user_id
        from public.workspace_users wu
        left join public.roles r on r.id = wu.role_id
        where wu.workspace_id = v_run.workspace_id and wu.status = 'active'
          and (
            (v_next.approver_role_id is not null and wu.role_id = v_next.approver_role_id)
            or (v_next.approver_role_id is null and (wu.is_owner or r.slug in ('owner', 'admin')))
          )
      loop
        perform public.create_notification(
          v_run.workspace_id,
          v_approver.user_id,
          'automation',
          'automation-approval-needed',
          jsonb_build_object('message', v_approval_message),
          array['In-App'],
          'High',
          'automation',
          v_run.automation_id
        );
      end loop;
    elsif v_next.action_type = 'business_hours_delay' then
      v_scheduled_for := public.compute_business_hours_deadline(v_run.workspace_id, now(), coalesce(nullif(v_next.action_config->>'hours', '')::numeric, 24));
      insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
      values (v_run.workspace_id, p_run_id, v_next.id, 'pending_delay', v_scheduled_for);
    elsif v_wait_mode = 'until_date' then
      v_scheduled_for := nullif(v_next.action_config->>'wait_until_at', '')::timestamptz;
      if v_scheduled_for is null then
        perform public.execute_automation_step(p_run_id, v_next.id);
      else
        insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
        values (v_run.workspace_id, p_run_id, v_next.id, 'pending_delay', v_scheduled_for);
      end if;
    elsif v_wait_mode = 'until_condition' then
      insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
      values (v_run.workspace_id, p_run_id, v_next.id, 'pending_delay', now());
    elsif v_next.delay_minutes > 0 then
      insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
      values (v_run.workspace_id, p_run_id, v_next.id, 'pending_delay', now() + make_interval(mins => v_next.delay_minutes));
    else
      perform public.execute_automation_step(p_run_id, v_next.id);
    end if;
    return;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.execute_automation_step(p_run_id uuid, p_step_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run record;
  v_step record;
  v_eng record;
  v_workspace record;
  v_branding record;
  v_context jsonb;
  v_status text := 'completed';
  v_error text;
  v_skip_note text;
  v_response record;
  v_service record;
  v_new_engagement_id uuid;
  v_doc_request_id uuid;
  v_doc_request_entity_type text;
  v_doc_request_entity_id uuid;
  v_target_stage_id uuid;
  v_target_order int;
  v_current_order int;
  v_loop_guard int;
  v_thread_id uuid;
  v_new_client_id uuid;
  v_normalized_email text;
  v_normalized_phone text;
  v_quote_id uuid;
  v_child_run_id uuid;
  v_portal_user_id uuid;
  v_channels text[];
  v_recipient record;
  v_organizer_link text;
  v_base_url text;
  v_resolved_organizer_template_id uuid;
  v_assign_target text;
  v_assignment_mode text;
  v_resolved_staff_id uuid;
  v_appointment_start timestamptz;
  v_appointment_end timestamptz;
  v_dnd_channel text;
  v_resolved_service_id uuid;
  v_target_process_id uuid;
  v_link_template_id_raw text;
  v_pipeline_entity_type text;
  v_pipeline_entity_id uuid;
  v_pipeline_run_id uuid;
  v_pipeline_stage_id uuid;
  v_rendered_message text;
  v_close_stage_id uuid;
  v_step_tags text[];
  v_tag text;
  v_signature_attachment_id uuid;
  v_signature_title text;
  v_signature_recipient_email text;
  v_signature_recipient_name text;
  v_signature_request_id uuid;
  v_signature_access_token uuid;
  v_new_task_id uuid;
  v_connection_id uuid;
begin
  select * into v_run from public.automation_runs where id = p_run_id;
  select * into v_step from public.automation_steps where id = p_step_id;

  if v_run.status <> 'running' then
    return;
  end if;

  if not public.is_workspace_operational(v_run.workspace_id) then
    return;
  end if;

  v_connection_id := nullif(v_run.trigger_snapshot->>'connection_id', '')::uuid;

  if v_run.engagement_id is not null then
    select e.engagement_number, e.status, e.priority, e.service_id, c.first_name, c.last_name, c.primary_email, c.primary_phone,
      c.sms_opt_out, c.email_opt_out, c.relationship_manager_id
    into v_eng
    from public.engagements e
    left join public.clients c on c.id = e.client_id
    where e.id = v_run.engagement_id;
  elsif v_run.client_id is not null then
    select null::text as engagement_number, null::text as status, null::text as priority, null::uuid as service_id,
      c.first_name, c.last_name, c.primary_email, c.primary_phone, c.sms_opt_out, c.email_opt_out, c.relationship_manager_id
    into v_eng
    from public.clients c
    where c.id = v_run.client_id;
  else
    select null::text as engagement_number, null::text as status, null::text as priority, null::uuid as service_id,
      null::text as first_name, null::text as last_name, null::text as primary_email, null::text as primary_phone,
      null::boolean as sms_opt_out, null::boolean as email_opt_out, null::uuid as relationship_manager_id
    into v_eng;
  end if;

  select name, timezone into v_workspace from public.workspaces where id = v_run.workspace_id;
  select support_phone, support_email, custom_domain into v_branding from public.branding where workspace_id = v_run.workspace_id;

  v_context := jsonb_build_object(
    'engagement_number', v_eng.engagement_number,
    'client_name', btrim(coalesce(v_eng.first_name, '') || ' ' || coalesce(v_eng.last_name, '')),
    'first_name', v_eng.first_name,
    'firm_name', v_workspace.name,
    'status', v_eng.status,
    'tax_year', (extract(year from now())::int - 1)::text,
    'office_phone', v_branding.support_phone,
    'office_email', v_branding.support_email,
    'portal_link', 'https://verexahq.com/portal/login'
  );

  begin
    if v_step.action_type = 'delay' then
      null;
    elsif v_step.action_type = 'business_hours_delay' then
      null;
    elsif v_step.action_type = 'condition' then
      null;
    elsif v_step.action_type = 'webhook' then
      if nullif(v_step.action_config->>'url', '') is null then
        raise exception 'No URL configured for this step';
      end if;
      if v_run.is_test then
        v_skip_note := 'test mode -- would call webhook ' || (v_step.action_config->>'url');
      else
        insert into public.automation_webhook_deliveries (workspace_id, run_id, url, payload)
        values (
          v_run.workspace_id, p_run_id, v_step.action_config->>'url',
          v_context || jsonb_build_object('trigger', v_run.trigger_snapshot)
        );
      end if;
    elsif v_step.action_type = 'send_email' then
      if v_eng.primary_email is null then
        raise exception 'Client has no email on file';
      end if;
      if v_run.is_test then
        v_skip_note := 'test mode -- would email ' || v_eng.primary_email;
      elsif v_eng.email_opt_out then
        v_skip_note := 'client has opted out of email';
      else
        v_link_template_id_raw := nullif(v_step.action_config->>'organizer_template_id', '');
        if v_link_template_id_raw is not null then
          v_resolved_organizer_template_id := case
            when v_link_template_id_raw = 'current_run' then nullif(v_run.trigger_snapshot->>'last_organizer_template_id', '')::uuid
            else v_link_template_id_raw::uuid
          end;
          v_base_url := 'https://' || coalesce(nullif(v_branding.custom_domain, ''), 'verexahq.com');
          select v_base_url || '/o/' || public_token::text into v_organizer_link
          from public.organizer_templates where id = v_resolved_organizer_template_id;
          v_context := v_context || jsonb_build_object('organizer_link', v_organizer_link);
        end if;
        insert into public.notification_queue (workspace_id, recipient_email, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
        values (
          v_run.workspace_id, v_eng.primary_email, 'Email', v_step.action_config->>'template_slug', v_context,
          case when v_run.engagement_id is not null then 'engagement' else 'client' end,
          coalesce(v_run.engagement_id, v_run.client_id),
          'automation', 'automation_step:' || p_step_id || ':' || p_run_id
        )
        on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      end if;
    elsif v_step.action_type = 'send_sms' then
      if v_eng.primary_phone is null then
        raise exception 'Client has no phone on file';
      end if;
      if v_run.is_test then
        v_skip_note := 'test mode -- would text ' || v_eng.primary_phone;
      elsif v_eng.sms_opt_out then
        v_skip_note := 'client has opted out of sms';
      else
        v_link_template_id_raw := nullif(v_step.action_config->>'organizer_template_id', '');
        if v_link_template_id_raw is not null then
          v_resolved_organizer_template_id := case
            when v_link_template_id_raw = 'current_run' then nullif(v_run.trigger_snapshot->>'last_organizer_template_id', '')::uuid
            else v_link_template_id_raw::uuid
          end;
          v_base_url := 'https://' || coalesce(nullif(v_branding.custom_domain, ''), 'verexahq.com');
          select v_base_url || '/o/' || public_token::text into v_organizer_link
          from public.organizer_templates where id = v_resolved_organizer_template_id;
          v_context := v_context || jsonb_build_object('organizer_link', v_organizer_link);
        end if;
        insert into public.notification_queue (workspace_id, recipient_phone, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
        values (
          v_run.workspace_id, v_eng.primary_phone, 'SMS', v_step.action_config->>'template_slug', v_context,
          case when v_run.engagement_id is not null then 'engagement' else 'client' end,
          coalesce(v_run.engagement_id, v_run.client_id),
          'automation', 'automation_step:' || p_step_id || ':' || p_run_id
        )
        on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      end if;
    elsif v_step.action_type = 'create_task' then
      if v_run.engagement_id is null and v_run.client_id is null and v_connection_id is null then
        raise exception 'This workflow run has no engagement, client, or connection to attach a task to';
      end if;
      insert into public.tasks (workspace_id, engagement_id, client_id, firm_connection_id, title, description, assigned_staff_id, due_date, priority, visibility)
      values (
        v_run.workspace_id, v_run.engagement_id,
        case when v_run.engagement_id is null then v_run.client_id else null end,
        case when v_run.engagement_id is null and v_run.client_id is null then v_connection_id else null end,
        public.render_merge_fields(coalesce(v_step.action_config->>'title', 'Automated task'), v_context),
        public.render_merge_fields(v_step.action_config->>'description', v_context),
        case when v_step.action_config->>'assigned_staff_id' = 'client_relationship_manager' then v_eng.relationship_manager_id
             else nullif(v_step.action_config->>'assigned_staff_id', '')::uuid end,
        case when v_step.action_config ? 'due_in_days' then now() + make_interval(days => (v_step.action_config->>'due_in_days')::int) else null end,
        coalesce(v_step.action_config->>'priority', 'medium'),
        coalesce(nullif(v_step.action_config->>'visibility', ''), 'internal')
      )
      returning id into v_new_task_id;

      update public.automation_runs
      set trigger_snapshot = coalesce(trigger_snapshot, '{}'::jsonb)
        || jsonb_build_object(
             'created_tasks',
             coalesce(trigger_snapshot->'created_tasks', '{}'::jsonb) || jsonb_build_object(p_step_id::text, v_new_task_id)
           )
      where id = p_run_id;
    elsif v_step.action_type = 'create_appointment' then
      if v_run.engagement_id is null and v_run.client_id is null then
        raise exception 'This workflow run has no engagement or client to schedule an appointment for';
      end if;

      v_appointment_start := (
        (current_date + coalesce((v_step.action_config->>'days_from_now')::int, 1))
        + coalesce(nullif(v_step.action_config->>'time_of_day', '')::time, '10:00'::time)
      ) at time zone coalesce(nullif(v_workspace.timezone, ''), 'America/New_York');
      v_appointment_end := v_appointment_start + make_interval(mins => coalesce((v_step.action_config->>'duration_minutes')::int, 30));

      insert into public.appointments (workspace_id, client_id, engagement_id, staff_id, title, description, location, start_at, end_at, status)
      values (
        v_run.workspace_id, v_run.client_id, v_run.engagement_id,
        nullif(v_step.action_config->>'staff_id', '')::uuid,
        public.render_merge_fields(coalesce(v_step.action_config->>'title', 'Appointment'), v_context),
        nullif(public.render_merge_fields(v_step.action_config->>'description', v_context), ''),
        nullif(v_step.action_config->>'location', ''),
        v_appointment_start, v_appointment_end, 'scheduled'
      );
    elsif v_step.action_type = 'add_dnd' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to opt out';
      end if;
      v_dnd_channel := coalesce(nullif(v_step.action_config->>'channel', ''), 'both');
      update public.clients
      set sms_opt_out = case when v_dnd_channel in ('sms', 'both') then true else sms_opt_out end,
          sms_opt_out_at = case when v_dnd_channel in ('sms', 'both') then now() else sms_opt_out_at end,
          email_opt_out = case when v_dnd_channel in ('email', 'both') then true else email_opt_out end,
          email_opt_out_at = case when v_dnd_channel in ('email', 'both') then now() else email_opt_out_at end
      where id = v_run.client_id;
    elsif v_step.action_type = 'remove_dnd' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to opt back in';
      end if;
      v_dnd_channel := coalesce(nullif(v_step.action_config->>'channel', ''), 'both');
      update public.clients
      set sms_opt_out = case when v_dnd_channel in ('sms', 'both') then false else sms_opt_out end,
          sms_opt_out_at = case when v_dnd_channel in ('sms', 'both') then null else sms_opt_out_at end,
          email_opt_out = case when v_dnd_channel in ('email', 'both') then false else email_opt_out end,
          email_opt_out_at = case when v_dnd_channel in ('email', 'both') then null else email_opt_out_at end
      where id = v_run.client_id;
    elsif v_step.action_type = 'send_organizer_template' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to send an organizer to';
      end if;

      v_resolved_service_id := coalesce(
        nullif(v_run.trigger_snapshot->>'service_id', '')::uuid,
        (
          select service_id
          from public.client_service_interests
          where client_id = v_run.client_id
          order by created_at desc
          limit 1
        )
      );

      v_resolved_organizer_template_id := coalesce(
        nullif(v_step.action_config->>'organizer_template_id', '')::uuid,
        (
          select ot.id
          from public.services s
          join public.organizer_templates svc_ot on svc_ot.id = s.organizer_template_id
          join public.organizer_templates ot
            on ot.slug = svc_ot.slug
            and ot.workspace_id = v_run.workspace_id
          where s.id = v_resolved_service_id
          limit 1
        )
      );

      if v_resolved_organizer_template_id is null then
        raise exception 'Could not determine which organizer to send -- no service on file for this client and no organizer template configured on this step';
      end if;

      if v_run.is_test then
        v_skip_note := 'test mode -- would send an organizer request to the client';
      else
        insert into public.organizer_responses (workspace_id, client_id, engagement_id, organizer_template_id)
        values (v_run.workspace_id, v_run.client_id, v_run.engagement_id, v_resolved_organizer_template_id);

        update public.automation_runs
        set trigger_snapshot = coalesce(trigger_snapshot, '{}'::jsonb) || jsonb_build_object('last_organizer_template_id', v_resolved_organizer_template_id)
        where id = p_run_id;
      end if;
    elsif v_step.action_type = 'create_engagement' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to create an engagement for';
      end if;
      if v_run.trigger_snapshot->>'response_id' is null then
        raise exception 'This action only works on a run triggered by an organizer submission';
      end if;

      select id, resolved_service_id, needs_service_review into v_response
      from public.organizer_responses where id = (v_run.trigger_snapshot->>'response_id')::uuid;

      if v_response.id is null or v_response.needs_service_review or v_response.resolved_service_id is null then
        raise exception 'The organizer response needs a service manually resolved before an engagement can be created';
      end if;

      select id into v_service from public.services where id = v_response.resolved_service_id;

      insert into public.engagements (workspace_id, client_id, service_id)
      values (v_run.workspace_id, v_run.client_id, v_service.id)
      returning id into v_new_engagement_id;
    elsif v_step.action_type = 'send_engagement_letter' then
      if v_run.engagement_id is null then
        raise exception 'This workflow run has no engagement to send an engagement letter for';
      end if;
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to send an engagement letter to';
      end if;

      v_resolved_organizer_template_id := coalesce(
        nullif(v_step.action_config->>'engagement_letter_template_id', '')::uuid,
        (select engagement_letter_template_id from public.services where id = v_eng.service_id)
      );

      if v_resolved_organizer_template_id is null then
        raise exception 'No engagement letter template configured for this step or its service';
      end if;

      if v_run.is_test then
        v_skip_note := 'test mode -- would send an engagement letter for signature';
      else
        insert into public.pending_engagement_letter_sends (workspace_id, engagement_id, client_id, engagement_letter_template_id, additional_signer_relationship_type)
        values (v_run.workspace_id, v_run.engagement_id, v_run.client_id, v_resolved_organizer_template_id, nullif(v_step.action_config->>'additional_signer_relationship_type', ''));
      end if;
    elsif v_step.action_type = 'send_document_for_signature' then
      v_signature_attachment_id := nullif(v_step.action_config->>'attachment_id', '')::uuid;
      if v_signature_attachment_id is null then
        raise exception 'No document configured for this step';
      end if;
      v_signature_title := coalesce(nullif(public.render_merge_fields(v_step.action_config->>'title', v_context), ''), 'Please sign this document');
      v_signature_recipient_email := null;
      v_signature_recipient_name := null;

      if v_eng.primary_email is not null then
        v_signature_recipient_email := v_eng.primary_email;
        v_signature_recipient_name := btrim(coalesce(v_eng.first_name, '') || ' ' || coalesce(v_eng.last_name, ''));
      elsif v_connection_id is not null then
        select w.primary_contact_email, w.name into v_signature_recipient_email, v_signature_recipient_name
        from public.firm_connections fc
        join public.workspaces w on w.id = fc.child_workspace_id
        where fc.id = v_connection_id;
      end if;

      if v_signature_recipient_email is null then
        raise exception 'No recipient email could be resolved to send this document for signature';
      end if;

      if v_run.is_test then
        v_skip_note := 'test mode -- would send "' || v_signature_title || '" to ' || v_signature_recipient_email || ' for signature';
      else
        insert into public.signature_requests (workspace_id, attachment_id, title)
        values (v_run.workspace_id, v_signature_attachment_id, v_signature_title)
        returning id into v_signature_request_id;

        insert into public.signature_request_signers (signature_request_id, signer_name, signer_email, sign_order)
        values (v_signature_request_id, coalesce(nullif(v_signature_recipient_name, ''), 'Recipient'), v_signature_recipient_email, 1)
        returning access_token into v_signature_access_token;

        v_base_url := 'https://' || coalesce(nullif(v_branding.custom_domain, ''), 'verexahq.com');

        insert into public.notification_queue (workspace_id, recipient_email, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
        values (
          v_run.workspace_id, v_signature_recipient_email, 'Email', 'document-signature-request',
          jsonb_build_object('title', v_signature_title, 'sign_link', v_base_url || '/sign/' || v_signature_access_token::text, 'firm_name', v_workspace.name),
          'document', v_signature_attachment_id,
          'automation', 'automation_step:' || p_step_id || ':' || p_run_id
        )
        on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;

        update public.automation_runs
        set trigger_snapshot = coalesce(trigger_snapshot, '{}'::jsonb)
          || jsonb_build_object(
               'document_signatures',
               coalesce(trigger_snapshot->'document_signatures', '{}'::jsonb) || jsonb_build_object(p_step_id::text, v_signature_request_id)
             )
        where id = p_run_id;
      end if;
    elsif v_step.action_type = 'change_stage' then
      if v_run.engagement_id is not null then
        v_pipeline_entity_type := 'engagement';
        v_pipeline_entity_id := v_run.engagement_id;
      elsif v_run.client_id is not null then
        v_pipeline_entity_type := 'client';
        v_pipeline_entity_id := v_run.client_id;
      else
        raise exception 'This workflow run has no engagement or client to advance';
      end if;

      select current_stage_id into v_pipeline_stage_id
      from public.pipeline_runs
      where entity_type = v_pipeline_entity_type and entity_id = v_pipeline_entity_id and status = 'Active'
      order by started_at desc limit 1;

      if v_pipeline_stage_id is null then
        raise exception 'This % has no active pipeline stage to advance', v_pipeline_entity_type;
      end if;

      update public.pipeline_stages set status = 'Completed', completed_at = now() where id = v_pipeline_stage_id;
    elsif v_step.action_type = 'send_document_request' then
      if v_run.engagement_id is null and v_run.client_id is null then
        raise exception 'This workflow run has no engagement or client to attach a document request to';
      end if;
      if nullif(v_step.action_config->>'document_request_template_id', '') is null then
        raise exception 'No document request template configured for this step';
      end if;

      v_doc_request_entity_type := case when v_run.engagement_id is not null then 'engagement' else 'client' end;
      v_doc_request_entity_id := coalesce(v_run.engagement_id, v_run.client_id);

      insert into public.document_requests (workspace_id, entity_type, entity_id, document_request_template_id, title, due_date)
      values (
        v_run.workspace_id, v_doc_request_entity_type, v_doc_request_entity_id,
        (v_step.action_config->>'document_request_template_id')::uuid,
        coalesce(public.render_merge_fields(v_step.action_config->>'title', v_context), 'Requested documents'),
        case when v_step.action_config ? 'due_in_days' then (now() + make_interval(days => (v_step.action_config->>'due_in_days')::int))::date else null end
      )
      returning id into v_doc_request_id;

      insert into public.document_request_item_statuses (document_request_id, document_request_item_id, name, is_required, category, status, fulfilled_by_attachment_id)
      select
        v_doc_request_id, dri.id, dri.name, dri.is_required, dri.category,
        coalesce(prior.status, 'pending'), prior.fulfilled_by_attachment_id
      from public.document_request_items dri
      left join lateral (
        select s.status, s.fulfilled_by_attachment_id
        from public.document_request_item_statuses s
        join public.document_requests r on r.id = s.document_request_id
        where r.entity_type = v_doc_request_entity_type and r.entity_id = v_doc_request_entity_id
          and s.name = dri.name and s.status <> 'pending'
        order by s.updated_at desc
        limit 1
      ) prior on true
      where dri.document_request_template_id = (v_step.action_config->>'document_request_template_id')::uuid;

    elsif v_step.action_type = 'assign_user' then
      v_assign_target := coalesce(v_step.action_config->>'target', case when v_run.engagement_id is not null then 'engagement' else 'client' end);
      v_assignment_mode := coalesce(v_step.action_config->>'assignment_mode', 'fixed');

      if v_assignment_mode = 'round_robin' then
        if v_assign_target = 'client' then
          select wu.user_id into v_resolved_staff_id
          from public.workspace_users wu
          where wu.workspace_id = v_run.workspace_id and wu.status = 'active'
            and (
              not (v_step.action_config ? 'staff_pool') or jsonb_array_length(v_step.action_config->'staff_pool') = 0
              or wu.user_id::text in (select jsonb_array_elements_text(v_step.action_config->'staff_pool'))
            )
          order by (
            select count(*) from public.clients c2
            where c2.relationship_manager_id = wu.user_id and c2.lifecycle_status not in ('archived', 'lost')
          ) asc, random()
          limit 1;
        else
          select wu.user_id into v_resolved_staff_id
          from public.workspace_users wu
          where wu.workspace_id = v_run.workspace_id and wu.status = 'active'
            and (
              not (v_step.action_config ? 'staff_pool') or jsonb_array_length(v_step.action_config->'staff_pool') = 0
              or wu.user_id::text in (select jsonb_array_elements_text(v_step.action_config->'staff_pool'))
            )
          order by (
            select count(*) from public.engagements e2
            where e2.assigned_staff_id = wu.user_id and e2.status not in ('Completed', 'Archived')
          ) asc, random()
          limit 1;
        end if;
        if v_resolved_staff_id is null then
          raise exception 'No eligible staff member found for round-robin assignment';
        end if;
      else
        v_resolved_staff_id := nullif(v_step.action_config->>'staff_id', '')::uuid;
        if v_resolved_staff_id is null then
          raise exception 'No staff member configured for this step';
        end if;
      end if;

      if v_assign_target = 'client' then
        if v_run.client_id is null then
          raise exception 'This workflow run has no client to assign';
        end if;
        update public.clients set relationship_manager_id = v_resolved_staff_id where id = v_run.client_id;
      else
        if v_run.engagement_id is null then
          raise exception 'This workflow run has no engagement to assign';
        end if;
        update public.engagements set assigned_staff_id = v_resolved_staff_id where id = v_run.engagement_id;
      end if;

    elsif v_step.action_type = 'send_notification' then
      v_channels := coalesce(
        (select array_agg(value #>> '{}') from jsonb_array_elements(v_step.action_config->'channels')),
        array['In-App']
      );
      v_rendered_message := public.render_merge_fields(v_step.action_config->>'message', v_context);

      v_resolved_staff_id := coalesce(
        nullif(v_step.action_config->>'staff_id', '')::uuid,
        (select user_id from public.workspace_users where workspace_id = v_run.workspace_id and is_owner = true and status = 'active' limit 1)
      );

      select wu.user_id, u.email into v_recipient
      from public.workspace_users wu
      join auth.users u on u.id = wu.user_id
      where wu.workspace_id = v_run.workspace_id and wu.user_id = v_resolved_staff_id and wu.status = 'active';

      if v_recipient.user_id is not null then
        if 'In-App' = any(v_channels) then
          perform public.create_notification(
            v_run.workspace_id,
            v_recipient.user_id,
            'automation',
            coalesce(nullif(v_step.action_config->>'template_key', ''), 'automation-step'),
            v_context || jsonb_build_object('message', v_rendered_message),
            array['In-App'],
            coalesce(nullif(v_step.action_config->>'priority', ''), 'Medium'),
            case when v_run.engagement_id is not null then 'engagement' else 'client' end,
            coalesce(v_run.engagement_id, v_run.client_id)
          );
        end if;

        if 'Email' = any(v_channels) and v_recipient.email is not null then
          insert into public.notification_queue (workspace_id, recipient_user_id, recipient_email, channel, template_key, payload, priority, entity_type, entity_id)
          values (
            v_run.workspace_id, v_recipient.user_id, v_recipient.email, 'Email', 'automation-staff-notification',
            v_context || jsonb_build_object('message', v_rendered_message),
            coalesce(nullif(v_step.action_config->>'priority', ''), 'Medium'),
            case when v_run.engagement_id is not null then 'engagement' else 'client' end,
            coalesce(v_run.engagement_id, v_run.client_id)
          );
        end if;
      end if;

    elsif v_step.action_type = 'move_pipeline_stage' then
      if v_run.client_id is null and v_run.engagement_id is null and v_connection_id is null then
        raise exception 'This workflow run has no client, engagement, or connection to move';
      end if;
      if nullif(v_step.action_config->>'process_id', '') is null or nullif(v_step.action_config->>'process_stage_id', '') is null then
        raise exception 'No target pipeline stage configured for this step';
      end if;

      v_pipeline_entity_type := case when v_run.engagement_id is not null then 'engagement' when v_run.client_id is not null then 'client' else 'firm_connection' end;
      v_pipeline_entity_id := coalesce(v_run.engagement_id, v_run.client_id, v_connection_id);

      select id, current_stage_id into v_pipeline_run_id, v_pipeline_stage_id
      from public.pipeline_runs
      where entity_type = v_pipeline_entity_type and entity_id = v_pipeline_entity_id and status = 'Active'
        and process_id = (v_step.action_config->>'process_id')::uuid
      order by started_at desc limit 1;

      if v_pipeline_run_id is null then
        v_pipeline_run_id := public.start_pipeline_run(v_pipeline_entity_type, v_pipeline_entity_id, (v_step.action_config->>'process_id')::uuid);
        select current_stage_id into v_pipeline_stage_id from public.pipeline_runs where id = v_pipeline_run_id;
        if v_pipeline_entity_type = 'engagement' then
          update public.engagements set workflow_id = (v_step.action_config->>'process_id')::uuid where id = v_pipeline_entity_id;
        end if;
      end if;

      select id into v_target_stage_id from public.pipeline_stages
      where pipeline_run_id = v_pipeline_run_id and process_stage_id = (v_step.action_config->>'process_stage_id')::uuid;

      if v_target_stage_id is null then
        raise exception 'Target stage is not part of this pipeline';
      end if;

      select display_order into v_target_order from public.pipeline_stages where id = v_target_stage_id;
      select display_order into v_current_order from public.pipeline_stages where id = v_pipeline_stage_id;

      if v_target_order < v_current_order then
        raise exception 'Moving backward through pipeline stages is not supported by this action';
      end if;

      if v_pipeline_stage_id is distinct from v_target_stage_id then
        for v_close_stage_id in
          select id from public.pipeline_stages
          where pipeline_run_id = v_pipeline_run_id
            and display_order > v_current_order and display_order < v_target_order
            and status not in ('Completed', 'Skipped')
          order by display_order desc
        loop
          update public.pipeline_stages set status = 'Skipped', completed_at = now() where id = v_close_stage_id;
        end loop;

        update public.pipeline_stages set status = 'Completed', completed_at = now() where id = v_pipeline_stage_id;
      end if;

      if v_pipeline_entity_type = 'client' and not exists (
        select 1 from public.processes where id = (v_step.action_config->>'process_id')::uuid and is_lead_funnel
      ) then
        for v_close_stage_id in
          select ps.id
          from public.pipeline_stages ps
          join public.pipeline_runs pr on pr.id = ps.pipeline_run_id
          join public.processes proc on proc.id = pr.process_id
          where pr.entity_type = 'client' and pr.entity_id = v_pipeline_entity_id and pr.status = 'Active'
            and pr.id <> v_pipeline_run_id and proc.is_lead_funnel
            and ps.status not in ('Completed', 'Skipped')
          order by ps.display_order desc
        loop
          update public.pipeline_stages set status = 'Skipped', completed_at = now() where id = v_close_stage_id;
        end loop;
      end if;

    elsif v_step.action_type = 'move_lead_to_service_pipeline' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to move';
      end if;

      v_resolved_service_id := coalesce(
        nullif(v_run.trigger_snapshot->>'service_id', '')::uuid,
        (
          select service_id
          from public.client_service_interests
          where client_id = v_run.client_id
          order by created_at desc
          limit 1
        )
      );

      if v_resolved_service_id is null then
        raise exception 'This client has no service on file to resolve a pipeline from';
      end if;

      select process_id into v_target_process_id from public.services where id = v_resolved_service_id;
      if v_target_process_id is null then
        raise exception 'The client''s selected service has no pipeline configured';
      end if;

      select id into v_pipeline_run_id
      from public.pipeline_runs
      where entity_type = 'client' and entity_id = v_run.client_id and status = 'Active' and process_id = v_target_process_id
      order by started_at desc limit 1;

      if v_pipeline_run_id is null then
        perform public.start_pipeline_run('client', v_run.client_id, v_target_process_id);
      end if;

      if not exists (select 1 from public.processes where id = v_target_process_id and is_lead_funnel) then
        for v_close_stage_id in
          select ps.id
          from public.pipeline_stages ps
          join public.pipeline_runs pr on pr.id = ps.pipeline_run_id
          join public.processes proc on proc.id = pr.process_id
          where pr.entity_type = 'client' and pr.entity_id = v_run.client_id and pr.status = 'Active'
            and pr.process_id <> v_target_process_id and proc.is_lead_funnel
            and ps.status not in ('Completed', 'Skipped')
          order by ps.display_order desc
        loop
          update public.pipeline_stages set status = 'Skipped', completed_at = now() where id = v_close_stage_id;
        end loop;
      end if;

    elsif v_step.action_type = 'mark_lead_lost' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to mark lost';
      end if;
      update public.clients set lifecycle_status = 'lost', lost_reason = v_step.action_config->>'reason', lost_at = now() where id = v_run.client_id;

    elsif v_step.action_type = 'convert_lead_to_client' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to convert';
      end if;
      update public.clients set lifecycle_status = 'active' where id = v_run.client_id;

    elsif v_step.action_type = 'update_client' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to update';
      end if;
      case v_step.action_config->>'field'
        when 'first_name' then
          update public.clients set first_name = v_step.action_config->>'value' where id = v_run.client_id;
        when 'middle_name' then
          update public.clients set middle_name = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'last_name' then
          update public.clients set last_name = v_step.action_config->>'value' where id = v_run.client_id;
        when 'suffix' then
          update public.clients set suffix = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'business_name' then
          update public.clients set business_name = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'client_type' then
          update public.clients set client_type = v_step.action_config->>'value' where id = v_run.client_id;
        when 'primary_email' then
          update public.clients
          set primary_email = v_step.action_config->>'value',
              normalized_email = nullif(lower(btrim(coalesce(v_step.action_config->>'value', ''))), '')
          where id = v_run.client_id;
        when 'primary_phone' then
          update public.clients
          set primary_phone = v_step.action_config->>'value',
              normalized_phone = nullif(regexp_replace(coalesce(v_step.action_config->>'value', ''), '\D', '', 'g'), '')
          where id = v_run.client_id;
        when 'address_line1' then
          update public.clients set address_line1 = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'address_line2' then
          update public.clients set address_line2 = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'city' then
          update public.clients set city = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'state' then
          update public.clients set state = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'postal_code' then
          update public.clients set postal_code = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'country' then
          update public.clients set country = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'relationship_manager_id' then
          update public.clients set relationship_manager_id = nullif(v_step.action_config->>'value', '')::uuid where id = v_run.client_id;
        else
          raise exception 'Unsupported field for update_client: %', v_step.action_config->>'field';
      end case;

    elsif v_step.action_type = 'create_client' then
      v_normalized_email := nullif(lower(btrim(v_step.action_config->>'primary_email')), '');
      v_normalized_phone := nullif(regexp_replace(coalesce(v_step.action_config->>'primary_phone', ''), '\D', '', 'g'), '');

      select id into v_new_client_id
      from public.clients
      where workspace_id = v_run.workspace_id
        and merged_into_client_id is null
        and (
          (v_normalized_email is not null and normalized_email = v_normalized_email)
          or (v_normalized_phone is not null and normalized_phone = v_normalized_phone)
        )
      limit 1;

      if v_new_client_id is null then
        insert into public.clients (workspace_id, client_type, first_name, last_name, primary_email, primary_phone, normalized_email, normalized_phone, lifecycle_status)
        values (
          v_run.workspace_id,
          coalesce(nullif(v_step.action_config->>'client_type', ''), 'individual'),
          v_step.action_config->>'first_name',
          v_step.action_config->>'last_name',
          v_step.action_config->>'primary_email',
          v_step.action_config->>'primary_phone',
          v_normalized_email,
          v_normalized_phone,
          coalesce(nullif(v_step.action_config->>'lifecycle_status', ''), 'lead')
        )
        returning id into v_new_client_id;
      end if;

    elsif v_step.action_type = 'create_quote' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to quote';
      end if;
      insert into public.quotes (workspace_id, client_id, engagement_id, service_id, title, subtotal, tax_amount, discount_amount, total_amount, valid_until, notes)
      values (
        v_run.workspace_id, v_run.client_id, v_run.engagement_id,
        nullif(v_step.action_config->>'service_id', '')::uuid,
        coalesce(public.render_merge_fields(v_step.action_config->>'title', v_context), 'Quote'),
        coalesce((v_step.action_config->>'subtotal')::numeric, 0),
        coalesce((v_step.action_config->>'tax_amount')::numeric, 0),
        coalesce((v_step.action_config->>'discount_amount')::numeric, 0),
        coalesce((v_step.action_config->>'total_amount')::numeric, coalesce((v_step.action_config->>'subtotal')::numeric, 0)),
        nullif(v_step.action_config->>'valid_until', '')::date,
        public.render_merge_fields(v_step.action_config->>'notes', v_context)
      );

    elsif v_step.action_type = 'send_quote' then
      select id into v_quote_id from public.quotes
      where workspace_id = v_run.workspace_id
        and client_id = v_run.client_id
        and status = 'draft'
      order by created_at desc
      limit 1;

      if v_quote_id is null then
        raise exception 'No draft quote found to send for this client';
      end if;

      if v_run.is_test then
        v_skip_note := 'test mode -- would send this quote to the client';
      else
        update public.quotes set status = 'sent' where id = v_quote_id;
      end if;

    elsif v_step.action_type = 'add_tag' then
      v_step_tags := coalesce(
        (select array_agg(value #>> '{}') from jsonb_array_elements(v_step.action_config->'tags')),
        case when nullif(v_step.action_config->>'tag', '') is not null then array[v_step.action_config->>'tag'] else null end
      );
      if v_step_tags is null or array_length(v_step_tags, 1) is null then
        raise exception 'No tag configured for this step';
      end if;
      if v_run.client_id is not null then
        update public.clients
        set tags = array(select distinct unnest(coalesce(tags, '{}') || v_step_tags))
        where id = v_run.client_id;
      elsif v_connection_id is not null then
        update public.firm_connections
        set tags = array(select distinct unnest(coalesce(tags, '{}') || v_step_tags))
        where id = v_connection_id;
      else
        raise exception 'This workflow run has no client or connection to tag';
      end if;

    elsif v_step.action_type = 'remove_tag' then
      v_step_tags := coalesce(
        (select array_agg(value #>> '{}') from jsonb_array_elements(v_step.action_config->'tags')),
        case when nullif(v_step.action_config->>'tag', '') is not null then array[v_step.action_config->>'tag'] else null end
      );
      if v_step_tags is null or array_length(v_step_tags, 1) is null then
        raise exception 'No tag configured for this step';
      end if;
      if v_run.client_id is not null then
        foreach v_tag in array v_step_tags loop
          update public.clients set tags = array_remove(coalesce(tags, '{}'), v_tag) where id = v_run.client_id;
        end loop;
      elsif v_connection_id is not null then
        foreach v_tag in array v_step_tags loop
          update public.firm_connections set tags = array_remove(coalesce(tags, '{}'), v_tag) where id = v_connection_id;
        end loop;
      else
        raise exception 'This workflow run has no client or connection to untag';
      end if;

    elsif v_step.action_type = 'add_note' then
      if v_run.engagement_id is null and v_run.client_id is null then
        raise exception 'This workflow run has no entity to attach a note to';
      end if;
      if nullif(v_step.action_config->>'body', '') is null then
        raise exception 'No note text configured for this step';
      end if;
      insert into public.notes (workspace_id, entity_type, entity_id, body, is_internal)
      values (
        v_run.workspace_id,
        case when v_run.engagement_id is not null then 'engagement' else 'client' end,
        coalesce(v_run.engagement_id, v_run.client_id),
        public.render_merge_fields(v_step.action_config->>'body', v_context),
        true
      );

    elsif v_step.action_type = 'send_portal_message' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to message';
      end if;
      if nullif(v_step.action_config->>'body', '') is null then
        raise exception 'No message body configured for this step';
      end if;

      if v_run.is_test then
        v_skip_note := 'test mode -- would send a portal message to the client';
      else
        select id into v_thread_id from public.message_threads
        where workspace_id = v_run.workspace_id and entity_type = 'client' and entity_id = v_run.client_id and status = 'open'
        order by coalesce(last_message_at, created_at) desc
        limit 1;

        if v_thread_id is null then
          insert into public.message_threads (workspace_id, entity_type, entity_id, subject, channel)
          values (v_run.workspace_id, 'client', v_run.client_id, coalesce(v_step.action_config->>'subject', 'Message from your accountant'), 'portal')
          returning id into v_thread_id;
        end if;

        insert into public.messages (workspace_id, thread_id, sender_type, is_internal, body)
        values (v_run.workspace_id, v_thread_id, 'staff', false, public.render_merge_fields(v_step.action_config->>'body', v_context));

        update public.message_threads set last_message_at = now() where id = v_thread_id;
      end if;

    elsif v_step.action_type = 'invite_to_portal' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to invite';
      end if;

      if v_run.is_test then
        v_skip_note := 'test mode -- would invite the client to the portal';
      elsif not exists (select 1 from public.client_portal_users where client_id = v_run.client_id) then
        if v_eng.primary_email is null then
          raise exception 'Client has no email on file to invite';
        end if;

        insert into public.client_portal_users (client_id, workspace_id, invited_email, invited_name)
        values (v_run.client_id, v_run.workspace_id, v_eng.primary_email, btrim(coalesce(v_eng.first_name, '') || ' ' || coalesce(v_eng.last_name, '')))
        returning id into v_portal_user_id;

        insert into public.pending_portal_invites (workspace_id, client_id, client_portal_user_id)
        values (v_run.workspace_id, v_run.client_id, v_portal_user_id);
      end if;

    elsif v_step.action_type = 'start_workflow' then
      if nullif(v_step.action_config->>'automation_id', '') is null then
        raise exception 'No automation configured for this step';
      end if;
      if not exists (
        select 1 from public.automations
        where id = (v_step.action_config->>'automation_id')::uuid
          and workspace_id = v_run.workspace_id and is_enabled = true and status = 'published'
      ) then
        raise exception 'Target automation is not available to start';
      end if;

      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status, is_test)
      values (v_run.workspace_id, (v_step.action_config->>'automation_id')::uuid, v_run.engagement_id, v_run.client_id, v_run.trigger_snapshot, 'running', v_run.is_test)
      returning id into v_child_run_id;
      perform public.start_next_automation_step(v_child_run_id);

    elsif v_step.action_type = 'end_workflow' then
      update public.automation_runs set status = 'completed', completed_at = now() where id = p_run_id;

    else
      raise exception 'Action type % is not yet supported', v_step.action_type;
    end if;
  exception when others then
    v_status := 'failed';
    v_error := sqlerrm;
  end;

  insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, workflow_run_id, status, execution_data, error_message, executed_at)
  values (
    v_run.workspace_id, v_run.automation_id, v_run.engagement_id, p_run_id, v_status,
    jsonb_build_object('step_id', p_step_id, 'action_type', v_step.action_type, 'run_id', p_run_id)
      || case when v_skip_note is not null then jsonb_build_object('skipped_reason', v_skip_note) else '{}'::jsonb end,
    v_error, now()
  );

  if v_status = 'failed' then
    update public.automation_runs set status = 'failed', completed_at = now() where id = p_run_id;
  else
    perform public.start_next_automation_step(p_run_id);
  end if;
end;
$function$;

-- ============================================================
-- Client portal suspension: reverses the prior locked decision (see
-- 20261016000000's comment) that a workspace's billing suspension must
-- never block its own clients' portal use. New product direction: a
-- suspended/archived/permanently_archived workspace's clients no longer get
-- normal portal write access either -- only the staff-side billing
-- recovery (Resume Checkout, on Settings > Plan & Usage) is exempt from
-- this, and that page was never gated by these policies in the first
-- place. Portal login/session itself is Supabase Auth, not RLS, so
-- authentication is unaffected -- a suspended workspace's clients can still
-- sign in, they just can't submit an organizer or send a message.
-- ============================================================
alter policy organizer_responses_insert on public.organizer_responses
  with check (
    (has_permission(workspace_id, 'engagements.manage'::text) and is_workspace_operational(workspace_id))
    or (is_portal_user(client_id) and (status = any (array['not_started'::text, 'in_progress'::text])) and is_workspace_operational(workspace_id))
  );

alter policy organizer_responses_update on public.organizer_responses
  using (
    (has_permission(workspace_id, 'engagements.manage'::text) and is_workspace_operational(workspace_id))
    or (is_portal_user(client_id) and (status = any (array['not_started'::text, 'in_progress'::text])) and is_workspace_operational(workspace_id))
  );

alter policy message_threads_write on public.message_threads
  with check (
    (has_permission(workspace_id, 'messages.view'::text) and is_workspace_operational(workspace_id))
    or ((entity_type = 'client'::text) and is_portal_user(entity_id) and (created_by = ( select auth.uid() )) and is_workspace_operational(workspace_id))
  );

alter policy messages_write on public.messages
  with check (
    (has_permission(workspace_id, 'messages.send'::text) and is_workspace_operational(workspace_id))
    or (is_internal and has_permission(workspace_id, 'messages.internal_note'::text) and is_workspace_operational(workspace_id))
    or ((sender_type = 'client'::text) and (is_internal = false) and (sender_id = ( select auth.uid() )) and (exists (
      select 1 from message_threads t where ((t.id = messages.thread_id) and is_portal_user_for_entity(t.entity_type, t.entity_id))
    )) and is_workspace_operational(workspace_id))
  );

-- New dunning notification introduced by the 7/3/1-day schedule rewrite
-- (see app/api/cron/check-billing-cycles/route.ts) -- mirrors the existing
-- global billing-card-reminder/billing-payment-failed templates exactly.
insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, merge_fields, status)
values (
  null,
  'Billing: workspace suspended',
  'billing-workspace-suspended',
  'platform',
  'Your Verexa HQ CRM account has been suspended for nonpayment',
  'Hi,\n\nWe were unable to collect payment for your Verexa HQ CRM subscription for the cycle ending {{period_end}}, so your account has been suspended. You can restore access at any time by resolving billing from Settings -> Plan & Usage.\n\nThank you.',
  '["period_end"]'::jsonb,
  'published'
)
on conflict do nothing;
