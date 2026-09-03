create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  pricing_method text not null check (pricing_method in ('flat_fee', 'hourly', 'custom_quote', 'tax_form_based', 'complexity_based')),
  base_amount numeric(12, 2),
  hourly_rate numeric(12, 2),
  form_based_rates jsonb not null default '{}'::jsonb,
  complexity_tiers jsonb not null default '[]'::jsonb,
  discount_rules jsonb not null default '{}'::jsonb,
  minimum_amount numeric(12, 2),
  maximum_amount numeric(12, 2),
  allow_override boolean not null default true,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug),
  check (minimum_amount is null or maximum_amount is null or minimum_amount <= maximum_amount)
);
comment on table public.pricing_rules is 'How a service is priced: flat fee, hourly, custom quote, tax-form-based rate table, or complexity tiers, with optional discount/override/min/max bounds.';

create unique index pricing_rules_system_slug_key on public.pricing_rules (slug) where workspace_id is null;
create index pricing_rules_workspace_idx on public.pricing_rules (workspace_id);

create table public.billing_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  invoice_timing text not null default 'after_work' check (invoice_timing in ('before_work', 'after_work')),
  deposit_required boolean not null default false,
  deposit_percent numeric(5, 2) check (deposit_percent is null or (deposit_percent between 0 and 100)),
  payment_before_release boolean not null default false,
  installments_allowed boolean not null default false,
  installment_count integer check (installment_count is null or installment_count > 0),
  late_fee_enabled boolean not null default false,
  late_fee_amount numeric(12, 2),
  late_fee_percent numeric(5, 2),
  automatic_reminders jsonb not null default '[]'::jsonb,
  collections_enabled boolean not null default false,
  collections_after_days integer,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);
comment on table public.billing_rules is 'When and how a service is invoiced/collected: timing, deposits, payment-before-release gate, installments, late fees, reminders, collections.';

create unique index billing_rules_system_slug_key on public.billing_rules (slug) where workspace_id is null;
create index billing_rules_workspace_idx on public.billing_rules (workspace_id);

create trigger set_updated_at before update on public.pricing_rules for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.billing_rules for each row execute function public.set_updated_at();
create trigger audit_pricing_rules after insert or update or delete on public.pricing_rules for each row execute function public.audit_trigger_fn();
create trigger audit_billing_rules after insert or update or delete on public.billing_rules for each row execute function public.audit_trigger_fn();

alter table public.pricing_rules enable row level security;
alter table public.billing_rules enable row level security;

create policy pricing_rules_select on public.pricing_rules
  for select using (workspace_id is null or public.is_workspace_member(workspace_id));
create policy pricing_rules_insert on public.pricing_rules
  for insert with check (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy pricing_rules_update on public.pricing_rules
  for update using (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy pricing_rules_delete on public.pricing_rules
  for delete using (workspace_id is not null and public.is_workspace_admin(workspace_id));

create policy billing_rules_select on public.billing_rules
  for select using (workspace_id is null or public.is_workspace_member(workspace_id));
create policy billing_rules_insert on public.billing_rules
  for insert with check (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy billing_rules_update on public.billing_rules
  for update using (workspace_id is not null and public.is_workspace_admin(workspace_id));
create policy billing_rules_delete on public.billing_rules
  for delete using (workspace_id is not null and public.is_workspace_admin(workspace_id));
