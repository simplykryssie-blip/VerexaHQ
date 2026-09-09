-- Firms/Packages/Bank-Products/Payouts foundation, per the design discussed
-- with the user: an ERO (or Service Bureau/multi-office firm -- see
-- isEroManagementTier()) needs to manage connected PTIN firms as first-class
-- entities, see their production (including bank products, which didn't
-- exist anywhere in the schema before this), define partnership Packages
-- separate from client-facing Services, and track what's owed to each PTIN
-- as money lands with the ERO first and gets redistributed (Option 1:
-- Verexa tracks the ledger; the actual money movement happens outside the
-- platform and the ERO marks a payout paid once sent).

-- ---------------------------------------------------------------------
-- Bank products -- lives in every workspace (any firm's own clients
-- benefit from this, not just ERO/SB), one row per bank-product
-- transaction on an engagement.
-- ---------------------------------------------------------------------

create table public.bank_product_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  bank_partner text not null,
  product_type text not null check (product_type in ('refund_transfer', 'refund_advance', 'other')),
  prep_fee_collected numeric,
  bank_fee numeric,
  addon_fee numeric,
  rebate_amount numeric,
  disbursement_method text check (disbursement_method in ('check', 'direct_deposit', 'prepaid_card')),
  status text not null default 'pending' check (status in ('pending', 'funded', 'disbursed', 'rejected')),
  disbursed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bank_product_transactions_workspace_id_idx on public.bank_product_transactions(workspace_id);
create index bank_product_transactions_engagement_id_idx on public.bank_product_transactions(engagement_id);

alter table public.bank_product_transactions enable row level security;

-- Mirrors invoices' policy shape exactly (billing.view / billing.manage / admin-only delete).
create policy bank_product_transactions_select on public.bank_product_transactions for select using (public.has_permission(workspace_id, 'billing.view'));
create policy bank_product_transactions_write on public.bank_product_transactions for insert with check (public.has_permission(workspace_id, 'billing.manage'));
create policy bank_product_transactions_update on public.bank_product_transactions for update using (public.has_permission(workspace_id, 'billing.manage')) with check (public.has_permission(workspace_id, 'billing.manage'));
create policy bank_product_transactions_delete on public.bank_product_transactions for delete using (public.is_workspace_admin(workspace_id));

-- ---------------------------------------------------------------------
-- Packages -- defined by an ERO/SB, separate from client-facing Services.
-- Supports a flat price, a revenue-share cut, or both at once.
-- ---------------------------------------------------------------------

create table public.firm_packages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  flat_price numeric,
  billing_cadence text check (billing_cadence in ('monthly', 'annual', 'one_time')),
  revenue_share_percent numeric check (revenue_share_percent is null or (revenue_share_percent >= 0 and revenue_share_percent <= 100)),
  revenue_share_scope text check (revenue_share_scope in ('all_production', 'bank_products_only', 'prep_fees_only')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index firm_packages_workspace_id_idx on public.firm_packages(workspace_id);

alter table public.firm_packages enable row level security;

-- A connected child firm needs to see the package it's actually on (same
-- dual-visibility shape as firm_connections_select), not just the ERO that
-- defined it.
create policy firm_packages_select on public.firm_packages for select using (
  public.is_workspace_member(workspace_id)
  or exists (
    select 1 from public.firm_connections fc
    where fc.parent_workspace_id = firm_packages.workspace_id
      and fc.status = 'active'
      and public.is_workspace_member(fc.child_workspace_id)
  )
);
create policy firm_packages_write on public.firm_packages for insert with check (public.is_workspace_admin(workspace_id));
create policy firm_packages_update on public.firm_packages for update using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy firm_packages_delete on public.firm_packages for delete using (public.is_workspace_admin(workspace_id));

alter table public.firm_connections add column if not exists package_id uuid references public.firm_packages(id) on delete set null;

-- ---------------------------------------------------------------------
-- Payout ledger -- one row per connection per period. Informational only
-- (Option 1): Verexa computes what's owed, the ERO pays the PTIN outside
-- the platform, then marks it paid here.
-- ---------------------------------------------------------------------

create table public.firm_payouts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.firm_connections(id) on delete cascade,
  parent_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  child_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  gross_prep_fees numeric not null default 0,
  gross_bank_product_rebates numeric not null default 0,
  ero_share_amount numeric not null default 0,
  amount_owed_to_ptin numeric not null default 0,
  status text not null default 'pending' check (status in ('pending', 'paid', 'disputed')),
  paid_at timestamptz,
  paid_by uuid references auth.users(id),
  payment_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, period_start, period_end)
);

create index firm_payouts_connection_id_idx on public.firm_payouts(connection_id);

alter table public.firm_payouts enable row level security;

-- Both sides can see the ledger (the PTIN should be able to see what
-- they're owed, not just take the ERO's word for it) -- only the parent
-- (ERO) can create/edit/mark paid.
create policy firm_payouts_select on public.firm_payouts for select using (
  public.is_workspace_member(parent_workspace_id) or public.is_workspace_member(child_workspace_id)
);
create policy firm_payouts_write on public.firm_payouts for insert with check (public.is_workspace_admin(parent_workspace_id));
create policy firm_payouts_update on public.firm_payouts for update using (public.is_workspace_admin(parent_workspace_id)) with check (public.is_workspace_admin(parent_workspace_id));
create policy firm_payouts_delete on public.firm_payouts for delete using (public.is_workspace_admin(parent_workspace_id));

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------

-- Read-only, aggregate-only cross-workspace rollup. Never returns raw
-- client/engagement rows -- only counts and sums -- so it can safely be
-- callable by either side of the connection without leaking the child
-- firm's actual client data to the parent.
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
    )
  ) into v_result;

  return v_result;
end;
$function$;

-- Computes (or recomputes, while still pending) a period's payout from
-- get_firm_production plus the connection's package terms, and upserts the
-- ledger row. Only the parent (ERO) can generate one.
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

  if v_conn.package_id is not null then
    select * into v_pkg from public.firm_packages where id = v_conn.package_id;
  end if;

  v_share_pct := coalesce(v_pkg.revenue_share_percent, 0);
  v_scope := coalesce(v_pkg.revenue_share_scope, 'all_production');

  v_ero_share := case v_scope
    when 'bank_products_only' then v_rebates * (v_share_pct / 100.0)
    when 'prep_fees_only' then v_prep_fees * (v_share_pct / 100.0)
    else (v_prep_fees + v_rebates) * (v_share_pct / 100.0)
  end;

  v_owed := (v_prep_fees + v_rebates) - v_ero_share;

  insert into public.firm_payouts (
    connection_id, parent_workspace_id, child_workspace_id, period_start, period_end,
    gross_prep_fees, gross_bank_product_rebates, ero_share_amount, amount_owed_to_ptin
  )
  values (
    p_connection_id, v_conn.parent_workspace_id, v_conn.child_workspace_id, p_period_start, p_period_end,
    v_prep_fees, v_rebates, v_ero_share, v_owed
  )
  on conflict (connection_id, period_start, period_end) do update set
    gross_prep_fees = excluded.gross_prep_fees,
    gross_bank_product_rebates = excluded.gross_bank_product_rebates,
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

-- Marks a payout paid once the ERO has actually sent the money outside
-- Verexa (Option 1 -- no real money movement happens here).
create or replace function public.mark_firm_payout_paid(
  p_payout_id uuid,
  p_payment_note text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_parent_workspace_id uuid;
begin
  select parent_workspace_id into v_parent_workspace_id from public.firm_payouts where id = p_payout_id;
  if v_parent_workspace_id is null then
    raise exception 'payout not found';
  end if;
  if not public.is_workspace_admin(v_parent_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  update public.firm_payouts
  set status = 'paid', paid_at = now(), paid_by = auth.uid(), payment_note = coalesce(p_payment_note, payment_note), updated_at = now()
  where id = p_payout_id;
end;
$function$;
