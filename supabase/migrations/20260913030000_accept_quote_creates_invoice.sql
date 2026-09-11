-- Accepting a quote is the client committing to the priced work -- it should
-- become a real invoice automatically instead of staff re-keying the same
-- line items by hand. quotes.invoice_id points at the invoice it produced
-- (nullable: only quotes accepted from now on get one).
alter table public.quotes add column if not exists invoice_id uuid references public.invoices(id);

create or replace function public.accept_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
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
    select id, process_id, billing_rule_id into v_service
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

      insert into public.engagements (workspace_id, client_id, service_id, workflow_id, billing_rule_id, case_type)
      values (v_quote.workspace_id, v_quote.client_id, v_service.id, v_service.process_id, v_service.billing_rule_id, v_case_type)
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
$$;
