-- Removes the Services "Requirements" checkboxes and the "Pricing rule" /
-- "Billing rule" fields platform-wide, per explicit request after
-- confirming what they actually do:
--
-- - requires_organizer, requires_engagement_letter, requires_documents,
--   requires_signature, requires_review, requires_invoice: pure UI
--   checkboxes with zero enforcement anywhere in the app (confirmed no
--   code reads them).
-- - requires_payment_before_release: the one flag with real behavior (a
--   warn-but-allow confirm() on engagement status change), but confirmed
--   false on every service platform-wide -- never actually exercised.
-- - pricing_rule_id / billing_rule_id (on services) and billing_rule_id
--   (on engagements): pricing_rules and billing_rules are both confirmed
--   completely empty platform-wide (0 rows, 0 references), and there's no
--   UI anywhere to create a row in either table -- a real firm could
--   never have used this even if they wanted to.
--
-- Safe to drop outright: no live data depends on any of this.

drop function if exists public.engagement_meets_payment_requirement(uuid);

-- accept_quote's signature is unchanged (only p_quote_id) -- just drop the
-- billing_rule_id column reference.
create or replace function public.accept_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quote public.quotes;
  v_service record;
  v_category_slug text;
  v_case_type text;
  v_engagement_id uuid;
  v_invoice_id uuid;
begin
  select * into v_quote from public.quotes where id = p_quote_id;
  if v_quote.id is null then
    raise exception 'quote not found';
  end if;
  if not public.is_portal_user(v_quote.client_id) then
    raise exception 'not authorized to respond to this quote';
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'this quote is no longer awaiting a response';
  end if;

  update public.quotes set status = 'accepted', accepted_at = now() where id = p_quote_id;

  v_engagement_id := v_quote.engagement_id;

  if v_engagement_id is null and v_quote.service_id is not null then
    select id, process_id into v_service
    from public.services
    where id = v_quote.service_id and (workspace_id is null or workspace_id = v_quote.workspace_id);

    if v_service.id is not null then
      select sc.slug into v_category_slug
      from public.services s
      join public.service_categories sc on sc.id = s.service_category_id
      where s.id = v_service.id;

      v_case_type := case v_category_slug
        when 'tax-preparation' then 'tax_return'
        when 'bookkeeping' then 'bookkeeping'
        when 'payroll' then 'payroll'
        when 'business-services' then 'business_service'
        else 'other'
      end;

      insert into public.engagements (workspace_id, client_id, service_id, workflow_id, case_type)
      values (v_quote.workspace_id, v_quote.client_id, v_service.id, v_service.process_id, v_case_type)
      returning id into v_engagement_id;

      if v_service.process_id is not null then
        perform public.start_pipeline_run('engagement', v_engagement_id, v_service.process_id);
      end if;

      update public.quotes set engagement_id = v_engagement_id where id = p_quote_id;
    end if;
  end if;

  -- One invoice per quote -- accept_quote can only ever run once for a given
  -- row (the status <> 'sent' guard above makes this whole function
  -- unreachable a second time), so there's no risk of double-invoicing.
  insert into public.invoices (workspace_id, client_id, engagement_id, status, line_items, subtotal, discount_amount, tax_amount, total_amount, notes)
  values (v_quote.workspace_id, v_quote.client_id, v_engagement_id, 'sent', v_quote.line_items, v_quote.subtotal, v_quote.discount_amount, v_quote.tax_amount, v_quote.total_amount, v_quote.notes)
  returning id into v_invoice_id;

  update public.quotes set invoice_id = v_invoice_id where id = p_quote_id;

  perform public._notify_admins_of_quote_response(v_quote.workspace_id, v_quote.client_id, p_quote_id, 'accepted');
end;
$function$;

-- create_engagement loses the p_billing_rule_id parameter entirely (it's
-- not trailing, so this needs a drop + recreate rather than a plain
-- replace).
drop function if exists public.create_engagement(uuid, uuid, uuid, uuid, engagement_priority, uuid, uuid, text, timestamp with time zone);

create function public.create_engagement(
  p_workspace_id uuid,
  p_client_id uuid,
  p_service_id uuid default null::uuid,
  p_assigned_staff_id uuid default null::uuid,
  p_priority engagement_priority default 'Medium'::engagement_priority,
  p_process_id uuid default null::uuid,
  p_case_type text default 'other'::text,
  p_due_date timestamp with time zone default null::timestamp with time zone
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_service record;
  v_process record;
  v_engagement_id uuid;
  v_process_id uuid;
  v_handoff_run_id uuid;
begin
  if not has_permission(p_workspace_id, 'engagements.manage') then
    raise exception 'insufficient permissions to create an engagement in this workspace';
  end if;

  if p_service_id is not null then
    select id, process_id into v_service from services
    where id = p_service_id and (workspace_id is null or workspace_id = p_workspace_id);
    if v_service.id is null then raise exception 'service % not found or not accessible in this workspace', p_service_id; end if;
  end if;

  if p_process_id is not null then
    select id into v_process from processes where id = p_process_id and (workspace_id is null or workspace_id = p_workspace_id);
    if v_process.id is null then raise exception 'pipeline % not found or not accessible in this workspace', p_process_id; end if;
    v_process_id := p_process_id;
  elsif p_service_id is not null then
    v_process_id := v_service.process_id;
  else
    v_process_id := null;
  end if;

  insert into engagements (workspace_id, client_id, service_id, workflow_id, assigned_staff_id, priority, case_type, due_date)
  values (p_workspace_id, p_client_id, p_service_id, v_process_id, p_assigned_staff_id, p_priority, coalesce(p_case_type, 'other'), p_due_date)
  returning id into v_engagement_id;

  if v_process_id is not null then
    update pipeline_runs
    set entity_type = 'engagement', entity_id = v_engagement_id
    where entity_type = 'client' and entity_id = p_client_id
      and process_id = v_process_id and status = 'Active'
    returning id into v_handoff_run_id;

    if v_handoff_run_id is not null then
      update pipeline_stages set entity_type = 'engagement' where pipeline_run_id = v_handoff_run_id;
    else
      perform start_pipeline_run('engagement', v_engagement_id, v_process_id);
    end if;
  end if;

  return v_engagement_id;
end;
$function$;

alter table public.services
  drop column if exists requires_organizer,
  drop column if exists requires_engagement_letter,
  drop column if exists requires_documents,
  drop column if exists requires_signature,
  drop column if exists requires_review,
  drop column if exists requires_invoice,
  drop column if exists requires_payment_before_release,
  drop column if exists pricing_rule_id,
  drop column if exists billing_rule_id;

alter table public.engagements
  drop column if exists billing_rule_id;

drop table if exists public.pricing_rules;
drop table if exists public.billing_rules;
