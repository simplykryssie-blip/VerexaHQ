-- Epic 4: Billing subsystem. New tables only -- reuses billing.view/
-- billing.manage/billing.refund permission keys already seeded in Phase 0,
-- reuses set_updated_at()/audit_trigger_fn() from Phase 0, and mirrors the
-- generate_engagement_number() numbering pattern for quotes/invoices.

create table public.engagement_pricing (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  pricing_method text not null default 'flat_fee',
  base_amount numeric(12,2),
  final_amount numeric(12,2),
  discount_amount numeric(12,2) not null default 0,
  notes text,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (engagement_id)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  client_id uuid not null references public.clients(id),
  engagement_id uuid references public.engagements(id),
  quote_number text,
  title text not null,
  status text not null default 'draft',
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  valid_until date,
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  notes text,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.change_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  quote_id uuid references public.quotes(id),
  description text not null,
  amount_delta numeric(12,2) not null default 0,
  status text not null default 'pending',
  created_by uuid references public.user_profiles(id),
  approved_by uuid references public.user_profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  client_id uuid not null references public.clients(id),
  engagement_id uuid references public.engagements(id),
  invoice_number text,
  status text not null default 'draft',
  issue_date date not null default current_date,
  due_date date,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  notes text,
  sent_at timestamptz,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  client_id uuid not null references public.clients(id) on delete cascade,
  type text not null,
  brand text,
  last4 text,
  exp_month smallint,
  exp_year smallint,
  is_default boolean not null default false,
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  client_id uuid not null references public.clients(id),
  invoice_id uuid references public.invoices(id),
  payment_method_id uuid references public.payment_methods(id),
  amount numeric(12,2) not null,
  currency text not null default 'usd',
  status text not null default 'succeeded',
  payment_date timestamptz not null default now(),
  reference text,
  notes text,
  recorded_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recurring_billing (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  client_id uuid not null references public.clients(id) on delete cascade,
  engagement_id uuid references public.engagements(id),
  frequency text not null,
  amount numeric(12,2) not null,
  next_billing_date date not null,
  status text not null default 'active',
  payment_method_id uuid references public.payment_methods(id),
  description text,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  client_id uuid not null references public.clients(id) on delete cascade,
  entry_type text not null,
  reference_table text,
  reference_id uuid,
  amount numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  description text,
  created_at timestamptz not null default now()
);

create index idx_engagement_pricing_workspace on public.engagement_pricing(workspace_id);
create index idx_quotes_workspace on public.quotes(workspace_id);
create index idx_quotes_client on public.quotes(client_id);
create index idx_change_orders_workspace on public.change_orders(workspace_id);
create index idx_change_orders_engagement on public.change_orders(engagement_id);
create index idx_invoices_workspace on public.invoices(workspace_id);
create index idx_invoices_client on public.invoices(client_id);
create index idx_payment_methods_workspace on public.payment_methods(workspace_id);
create index idx_payment_methods_client on public.payment_methods(client_id);
create index idx_payments_workspace on public.payments(workspace_id);
create index idx_payments_client on public.payments(client_id);
create index idx_payments_invoice on public.payments(invoice_id);
create index idx_recurring_billing_workspace on public.recurring_billing(workspace_id);
create index idx_recurring_billing_client on public.recurring_billing(client_id);
create index idx_client_ledger_workspace on public.client_ledger(workspace_id);
create index idx_client_ledger_client on public.client_ledger(client_id);

create trigger trg_updated_at before update on public.engagement_pricing for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.quotes for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.change_orders for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.invoices for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.payment_methods for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.payments for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.recurring_billing for each row execute function public.set_updated_at();

create trigger trg_audit after insert or update or delete on public.engagement_pricing for each row execute function public.audit_trigger_fn();
create trigger trg_audit after insert or update or delete on public.quotes for each row execute function public.audit_trigger_fn();
create trigger trg_audit after insert or update or delete on public.change_orders for each row execute function public.audit_trigger_fn();
create trigger trg_audit after insert or update or delete on public.invoices for each row execute function public.audit_trigger_fn();
create trigger trg_audit after insert or update or delete on public.payment_methods for each row execute function public.audit_trigger_fn();
create trigger trg_audit after insert or update or delete on public.payments for each row execute function public.audit_trigger_fn();
create trigger trg_audit after insert or update or delete on public.recurring_billing for each row execute function public.audit_trigger_fn();

create or replace function public.generate_quote_number()
returns trigger language plpgsql set search_path = 'public' as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next bigint;
begin
  if new.quote_number is not null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('quote_' || new.workspace_id::text || v_year, 0));
  select count(*) + 1 into v_next from public.quotes
    where workspace_id = new.workspace_id and to_char(created_at, 'YYYY') = v_year;
  new.quote_number := 'QUO-' || v_year || '-' || lpad(v_next::text, 6, '0');
  return new;
end;
$$;
create trigger trg_generate_quote_number before insert on public.quotes for each row execute function public.generate_quote_number();

create or replace function public.generate_invoice_number()
returns trigger language plpgsql set search_path = 'public' as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next bigint;
begin
  if new.invoice_number is not null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('invoice_' || new.workspace_id::text || v_year, 0));
  select count(*) + 1 into v_next from public.invoices
    where workspace_id = new.workspace_id and to_char(created_at, 'YYYY') = v_year;
  new.invoice_number := 'INV-' || v_year || '-' || lpad(v_next::text, 6, '0');
  return new;
end;
$$;
create trigger trg_generate_invoice_number before insert on public.invoices for each row execute function public.generate_invoice_number();

create or replace function public.ledger_invoice_issued()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_balance numeric(12,2);
begin
  select coalesce(sum(amount), 0) + new.total_amount into v_balance
    from public.client_ledger where client_id = new.client_id;

  insert into public.client_ledger (workspace_id, client_id, entry_type, reference_table, reference_id, amount, balance_after, description)
  values (new.workspace_id, new.client_id, 'invoice', 'invoices', new.id, new.total_amount, v_balance, 'Invoice ' || coalesce(new.invoice_number, '') || ' issued');

  return new;
end;
$$;

create trigger trg_ledger_invoice_issued_insert
  after insert on public.invoices
  for each row
  when (new.status <> 'draft')
  execute function public.ledger_invoice_issued();

create trigger trg_ledger_invoice_issued_update
  after update of status on public.invoices
  for each row
  when (old.status = 'draft' and new.status <> 'draft')
  execute function public.ledger_invoice_issued();

create or replace function public.apply_payment_to_invoice()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_balance numeric(12,2);
begin
  if new.invoice_id is not null then
    update public.invoices
      set amount_paid = amount_paid + new.amount,
          status = case
            when amount_paid + new.amount >= total_amount then 'paid'
            when amount_paid + new.amount > 0 then 'partially_paid'
            else status
          end
      where id = new.invoice_id;
  end if;

  select coalesce(sum(amount), 0) - new.amount into v_balance
    from public.client_ledger where client_id = new.client_id;

  insert into public.client_ledger (workspace_id, client_id, entry_type, reference_table, reference_id, amount, balance_after, description)
  values (new.workspace_id, new.client_id, 'payment', 'payments', new.id, -new.amount, v_balance, 'Payment received');

  return new;
end;
$$;
create trigger trg_apply_payment_to_invoice
  after insert on public.payments
  for each row when (new.status = 'succeeded')
  execute function public.apply_payment_to_invoice();

alter table public.engagement_pricing enable row level security;
alter table public.quotes enable row level security;
alter table public.change_orders enable row level security;
alter table public.invoices enable row level security;
alter table public.payment_methods enable row level security;
alter table public.payments enable row level security;
alter table public.recurring_billing enable row level security;
alter table public.client_ledger enable row level security;

create policy engagement_pricing_select on public.engagement_pricing for select using (has_permission(workspace_id, 'billing.view'));
create policy engagement_pricing_write on public.engagement_pricing for insert with check (has_permission(workspace_id, 'billing.manage'));
create policy engagement_pricing_update on public.engagement_pricing for update using (has_permission(workspace_id, 'billing.manage')) with check (has_permission(workspace_id, 'billing.manage'));
create policy engagement_pricing_delete on public.engagement_pricing for delete using (is_workspace_admin(workspace_id));

create policy quotes_select on public.quotes for select using (has_permission(workspace_id, 'billing.view'));
create policy quotes_write on public.quotes for insert with check (has_permission(workspace_id, 'billing.manage'));
create policy quotes_update on public.quotes for update using (has_permission(workspace_id, 'billing.manage')) with check (has_permission(workspace_id, 'billing.manage'));
create policy quotes_delete on public.quotes for delete using (is_workspace_admin(workspace_id));

create policy change_orders_select on public.change_orders for select using (has_permission(workspace_id, 'billing.view'));
create policy change_orders_write on public.change_orders for insert with check (has_permission(workspace_id, 'billing.manage'));
create policy change_orders_update on public.change_orders for update using (has_permission(workspace_id, 'billing.manage')) with check (has_permission(workspace_id, 'billing.manage'));
create policy change_orders_delete on public.change_orders for delete using (is_workspace_admin(workspace_id));

create policy invoices_select on public.invoices for select using (has_permission(workspace_id, 'billing.view'));
create policy invoices_write on public.invoices for insert with check (has_permission(workspace_id, 'billing.manage'));
create policy invoices_update on public.invoices for update using (has_permission(workspace_id, 'billing.manage')) with check (has_permission(workspace_id, 'billing.manage'));
create policy invoices_delete on public.invoices for delete using (is_workspace_admin(workspace_id));

create policy payment_methods_select on public.payment_methods for select using (has_permission(workspace_id, 'billing.view'));
create policy payment_methods_write on public.payment_methods for insert with check (has_permission(workspace_id, 'billing.manage'));
create policy payment_methods_update on public.payment_methods for update using (has_permission(workspace_id, 'billing.manage')) with check (has_permission(workspace_id, 'billing.manage'));
create policy payment_methods_delete on public.payment_methods for delete using (has_permission(workspace_id, 'billing.manage'));

create policy payments_select on public.payments for select using (has_permission(workspace_id, 'billing.view'));
create policy payments_write on public.payments for insert with check (has_permission(workspace_id, 'billing.manage'));
create policy payments_update on public.payments for update using (has_permission(workspace_id, 'billing.manage') or has_permission(workspace_id, 'billing.refund')) with check (has_permission(workspace_id, 'billing.manage') or has_permission(workspace_id, 'billing.refund'));
create policy payments_delete on public.payments for delete using (is_workspace_admin(workspace_id));

create policy recurring_billing_select on public.recurring_billing for select using (has_permission(workspace_id, 'billing.view'));
create policy recurring_billing_write on public.recurring_billing for insert with check (has_permission(workspace_id, 'billing.manage'));
create policy recurring_billing_update on public.recurring_billing for update using (has_permission(workspace_id, 'billing.manage')) with check (has_permission(workspace_id, 'billing.manage'));
create policy recurring_billing_delete on public.recurring_billing for delete using (is_workspace_admin(workspace_id));

create policy client_ledger_select on public.client_ledger for select using (has_permission(workspace_id, 'billing.view'));
