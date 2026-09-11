-- Bank/transmission/paperwork/add-on fees are pass-through costs taken off
-- the top of a bank product's payout before an ERO ever sees prep fees +
-- rebates to split with a PTIN -- the prior version of generate_firm_payout
-- computed the split off raw gross_prep_fees + gross_bank_product_rebates,
-- never netting these out. Fixes that, and persists the itemized deduction
-- on the payout row itself so the ledger shows exactly what was taken out,
-- not just the final numbers -- "for billing" means an ERO can point to
-- this row and show their math, not just trust it.
--
-- Only bank-product income (rebates) gets netted, not prep fees -- these
-- fee types only exist on bank_product_transactions rows in the first
-- place, so they're bank-product costs by construction. A prep-fees-only
-- package (or an ERO with no bank product transactions at all) sees zero
-- deduction and identical numbers to before this migration.

alter table public.firm_payouts
  add column gross_bank_fees numeric not null default 0,
  add column gross_addon_fees numeric not null default 0,
  add column gross_transmission_fees numeric not null default 0,
  add column gross_paperwork_fees numeric not null default 0;

create or replace function public.generate_firm_payout(
  p_connection_id uuid,
  p_period_start date,
  p_period_end date
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_conn record;
  v_pkg record;
  v_production jsonb;
  v_prep_fees numeric;
  v_rebates numeric;
  v_bank_fees numeric;
  v_addon_fees numeric;
  v_transmission_fees numeric;
  v_paperwork_fees numeric;
  v_net_rebates numeric;
  v_share_pct numeric;
  v_scope text;
  v_ero_share numeric;
  v_owed numeric;
  v_payout_id uuid;
begin
  select * into v_conn from public.firm_connections where id = p_connection_id;
  if v_conn.id is null then
    raise exception 'connection not found';
  end if;
  if not public.is_workspace_admin(v_conn.parent_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  v_production := public.get_firm_production(p_connection_id, p_period_start, p_period_end);
  v_prep_fees := coalesce((v_production ->> 'gross_prep_fees')::numeric, 0);
  v_rebates := coalesce((v_production ->> 'gross_bank_product_rebates')::numeric, 0);
  v_bank_fees := coalesce((v_production ->> 'gross_bank_fees')::numeric, 0);
  v_addon_fees := coalesce((v_production ->> 'gross_addon_fees')::numeric, 0);
  v_transmission_fees := coalesce((v_production ->> 'gross_transmission_fees')::numeric, 0);
  v_paperwork_fees := coalesce((v_production ->> 'gross_paperwork_fees')::numeric, 0);

  -- Bank product income net of what came out before the ERO ever saw it.
  -- Floored at 0 rather than going negative -- fees exceeding rebates is
  -- an out-of-pocket cost, not something this split should try to claw
  -- back from the prep-fee side.
  v_net_rebates := greatest(v_rebates - v_bank_fees - v_addon_fees - v_transmission_fees - v_paperwork_fees, 0);

  if v_conn.package_id is not null then
    select * into v_pkg from public.firm_packages where id = v_conn.package_id;
  end if;

  v_share_pct := coalesce(v_pkg.revenue_share_percent, 0);
  v_scope := coalesce(v_pkg.revenue_share_scope, 'all_production');

  v_ero_share := case v_scope
    when 'bank_products_only' then v_net_rebates * (v_share_pct / 100.0)
    when 'prep_fees_only' then v_prep_fees * (v_share_pct / 100.0)
    else (v_prep_fees + v_net_rebates) * (v_share_pct / 100.0)
  end;

  v_owed := (v_prep_fees + v_net_rebates) - v_ero_share;

  insert into public.firm_payouts (
    connection_id, parent_workspace_id, child_workspace_id, period_start, period_end,
    gross_prep_fees, gross_bank_product_rebates, gross_bank_fees, gross_addon_fees,
    gross_transmission_fees, gross_paperwork_fees, ero_share_amount, amount_owed_to_ptin
  )
  values (
    p_connection_id, v_conn.parent_workspace_id, v_conn.child_workspace_id, p_period_start, p_period_end,
    v_prep_fees, v_rebates, v_bank_fees, v_addon_fees, v_transmission_fees, v_paperwork_fees, v_ero_share, v_owed
  )
  on conflict (connection_id, period_start, period_end) do update set
    gross_prep_fees = excluded.gross_prep_fees,
    gross_bank_product_rebates = excluded.gross_bank_product_rebates,
    gross_bank_fees = excluded.gross_bank_fees,
    gross_addon_fees = excluded.gross_addon_fees,
    gross_transmission_fees = excluded.gross_transmission_fees,
    gross_paperwork_fees = excluded.gross_paperwork_fees,
    ero_share_amount = excluded.ero_share_amount,
    amount_owed_to_ptin = excluded.amount_owed_to_ptin,
    updated_at = now()
  where public.firm_payouts.status = 'pending'
  returning id into v_payout_id;

  if v_payout_id is null then
    select id into v_payout_id from public.firm_payouts
    where connection_id = p_connection_id and period_start = p_period_start and period_end = p_period_end;
  end if;

  return v_payout_id;
end;
$function$;
