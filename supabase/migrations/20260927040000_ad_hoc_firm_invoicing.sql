-- Lets any tier (ERO or Service Bureau) bill a connected firm a flat ad hoc
-- fee (e.g. an ERO charging a PTIN for software access/mentorship) the same
-- way they'd bill any client -- a plain invoice, no package or self-checkout
-- menu required. invoices/payments both switch from a hard client_id
-- requirement to "exactly one of client_id or firm_connection_id".

alter table public.invoices
  alter column client_id drop not null,
  add column firm_connection_id uuid references public.firm_connections(id);
alter table public.invoices
  add constraint invoices_client_xor_firm_chk check ((client_id is not null) <> (firm_connection_id is not null));

alter table public.payments
  alter column client_id drop not null,
  add column firm_connection_id uuid references public.firm_connections(id);
alter table public.payments
  add constraint payments_client_xor_firm_chk check ((client_id is not null) <> (firm_connection_id is not null));

-- apply_payment_to_invoice unconditionally posted a client_ledger entry --
-- client_ledger.client_id is NOT NULL, so a firm-billed payment (client_id
-- null) would violate that and roll back the whole payment insert. Guards
-- the ledger step only; the invoice balance update above it is already
-- invoice_id-keyed and needs no change.
create or replace function public.apply_payment_to_invoice()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  if new.client_id is not null then
    select coalesce(sum(amount), 0) - new.amount into v_balance
      from public.client_ledger where client_id = new.client_id;

    insert into public.client_ledger (workspace_id, client_id, entry_type, reference_table, reference_id, amount, balance_after, description)
    values (new.workspace_id, new.client_id, 'payment', 'payments', new.id, -new.amount, v_balance, 'Payment received');
  end if;

  return new;
end;
$function$;

-- ledger_invoice_issued has the identical unconditional-insert hazard,
-- firing on invoice creation itself (before any payment) -- confirmed via
-- its trigger definitions, which fire on insert whenever status <> 'draft'.
-- Since a new firm-billed invoice is created with status 'sent' directly,
-- this would otherwise crash on every single firm invoice.
create or replace function public.ledger_invoice_issued()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_balance numeric(12,2);
begin
  if new.client_id is null then
    return new;
  end if;

  select coalesce(sum(amount), 0) + new.total_amount into v_balance
    from public.client_ledger where client_id = new.client_id;

  insert into public.client_ledger (workspace_id, client_id, entry_type, reference_table, reference_id, amount, balance_after, description)
  values (new.workspace_id, new.client_id, 'invoice', 'invoices', new.id, new.total_amount, v_balance, 'Invoice ' || coalesce(new.invoice_number, '') || ' issued');

  return new;
end;
$function$;
