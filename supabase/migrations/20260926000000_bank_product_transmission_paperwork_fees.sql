-- Not every ERO does bank products at all (revenue_share_scope already
-- supports 'prep_fees_only', and every bank-product sum below already
-- coalesces to 0 when no transactions exist -- nothing here requires them).
-- For the EROs that do, they need to bill their PTIN preparers accurately,
-- which means seeing the full fee breakdown per return, not just the
-- rebate: bank_fee and addon_fee were already captured on
-- bank_product_transactions but never summed or shown anywhere, and there
-- was nowhere to record a transmission fee (the e-file transmitter's own
-- charge) or a paperwork/document fee at all. Adds both new columns and
-- rolls all four non-split fee types (bank/addon/transmission/paperwork)
-- into get_firm_production's aggregate, alongside the existing prep-fee and
-- rebate totals that already feed the revenue-share split -- these new
-- totals are informational only and do not change that split math.

alter table public.bank_product_transactions
  add column transmission_fee numeric,
  add column paperwork_fee numeric;

create or replace function public.get_firm_production(
  p_connection_id uuid,
  p_period_start date default null,
  p_period_end date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_conn record;
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  select * into v_conn from public.firm_connections where id = p_connection_id;
  if v_conn.id is null then
    raise exception 'connection not found';
  end if;
  if not (public.is_workspace_member(v_conn.parent_workspace_id) or public.is_workspace_member(v_conn.child_workspace_id)) then
    raise exception 'insufficient permissions';
  end if;

  v_start := coalesce(p_period_start, date_trunc('month', now())::date);
  v_end := coalesce(p_period_end, now()::date) + interval '1 day';

  select jsonb_build_object(
    'period_start', v_start::date,
    'period_end', (v_end - interval '1 day')::date,
    'active_clients', (
      select count(*) from public.clients
      where workspace_id = v_conn.child_workspace_id and merged_into_client_id is null
    ),
    'engagements_by_status', (
      select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
      from (
        select status, count(*) cnt from public.engagements
        where workspace_id = v_conn.child_workspace_id and created_at >= v_start and created_at < v_end
        group by status
      ) s
    ),
    'returns_completed', (
      select count(*) from public.engagements
      where workspace_id = v_conn.child_workspace_id and status = 'Completed' and updated_at >= v_start and updated_at < v_end
    ),
    'gross_prep_fees', (
      select coalesce(sum(amount_paid), 0) from public.invoices
      where workspace_id = v_conn.child_workspace_id and status = 'paid' and created_at >= v_start and created_at < v_end
    ),
    'bank_products', (
      select coalesce(jsonb_agg(jsonb_build_object('product_type', product_type, 'bank_partner', bank_partner, 'count', cnt, 'total_rebate', total_rebate)), '[]'::jsonb)
      from (
        select product_type, bank_partner, count(*) cnt, coalesce(sum(rebate_amount), 0) total_rebate
        from public.bank_product_transactions
        where workspace_id = v_conn.child_workspace_id and created_at >= v_start and created_at < v_end
        group by product_type, bank_partner
      ) b
    ),
    'gross_bank_product_rebates', (
      select coalesce(sum(rebate_amount), 0) from public.bank_product_transactions
      where workspace_id = v_conn.child_workspace_id and created_at >= v_start and created_at < v_end
    ),
    -- Informational only -- not part of the revenue-share split (which
    -- stays prep fees + bank rebates, same as before this migration).
    -- Bank/transmission fees are typically pass-through costs the
    -- preparer charged the client to cover a real expense; add-on and
    -- paperwork fees are extra revenue the preparer/ERO keeps outright.
    -- Either way, whether to split them is a package-terms decision, not
    -- something to bake into this aggregate.
    'gross_bank_fees', (
      select coalesce(sum(bank_fee), 0) from public.bank_product_transactions
      where workspace_id = v_conn.child_workspace_id and created_at >= v_start and created_at < v_end
    ),
    'gross_addon_fees', (
      select coalesce(sum(addon_fee), 0) from public.bank_product_transactions
      where workspace_id = v_conn.child_workspace_id and created_at >= v_start and created_at < v_end
    ),
    'gross_transmission_fees', (
      select coalesce(sum(transmission_fee), 0) from public.bank_product_transactions
      where workspace_id = v_conn.child_workspace_id and created_at >= v_start and created_at < v_end
    ),
    'gross_paperwork_fees', (
      select coalesce(sum(paperwork_fee), 0) from public.bank_product_transactions
      where workspace_id = v_conn.child_workspace_id and created_at >= v_start and created_at < v_end
    )
  ) into v_result;

  return v_result;
end;
$function$;
