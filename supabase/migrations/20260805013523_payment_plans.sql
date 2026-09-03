
create table public.payment_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  installment_number int not null,
  amount numeric(12,2) not null,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue', 'cancelled')),
  stripe_checkout_url text,
  paid_payment_id uuid references public.payments(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, installment_number)
);

create index payment_plans_invoice_idx on public.payment_plans (invoice_id);
create index payment_plans_workspace_idx on public.payment_plans (workspace_id);
create index payment_plans_paid_payment_idx on public.payment_plans (paid_payment_id);

create trigger payment_plans_set_updated_at
  before update on public.payment_plans
  for each row execute function public.set_updated_at();

alter table public.payment_plans enable row level security;

create policy payment_plans_select on public.payment_plans
  for select using (public.has_permission(workspace_id, 'billing.view'));

create policy payment_plans_portal_select on public.payment_plans
  for select using (
    exists (select 1 from public.invoices i where i.id = payment_plans.invoice_id and public.is_portal_user(i.client_id))
  );

create policy payment_plans_insert on public.payment_plans
  for insert with check (public.has_permission(workspace_id, 'billing.manage'));

create policy payment_plans_update on public.payment_plans
  for update using (public.has_permission(workspace_id, 'billing.manage'));

create policy payment_plans_delete on public.payment_plans
  for delete using (public.has_permission(workspace_id, 'billing.manage'));

-- Auto payment-receipt email: fires on every payments insert (webhook-driven
-- Stripe payments today, any future manual "record payment" path
-- automatically too) rather than being wired into one specific caller.
create or replace function public.enqueue_payment_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email text;
  v_invoice_number text;
begin
  if NEW.client_id is null then
    return NEW;
  end if;

  select cpu.user_id, u.email into v_user_id, v_email
  from public.client_portal_users cpu
  join auth.users u on u.id = cpu.user_id
  where cpu.client_id = NEW.client_id and cpu.is_primary = true and cpu.status = 'active'
  limit 1;

  if v_user_id is null then
    return NEW;
  end if;

  if NEW.invoice_id is not null then
    select invoice_number into v_invoice_number from public.invoices where id = NEW.invoice_id;
  end if;

  if public.is_notification_enabled(v_user_id, NEW.workspace_id, 'payment_receipt', 'Email') then
    insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key)
    values (NEW.workspace_id, 'Email', 'payment-receipt', 'payment_receipt',
            jsonb_build_object('invoice_number', coalesce(v_invoice_number, 'N/A'), 'amount', NEW.amount, 'payment_date', NEW.payment_date),
            v_user_id, v_email, 'payment_receipt:' || NEW.id)
    on conflict (workspace_id, template_key, dedupe_key) do nothing;
  end if;

  return NEW;
end;
$$;

create trigger payments_enqueue_receipt
  after insert on public.payments
  for each row execute function public.enqueue_payment_receipt();
