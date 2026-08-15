-- Keep invoices.sent_at / quotes.sent_at in sync with status.
-- Invoices/quotes have been created with status='sent' directly without
-- ever populating sent_at, since nothing set it. Rather than patching every
-- insert/update call site, enforce the invariant at the DB layer: whenever
-- status is 'sent' and sent_at is still null, stamp it now(). If status
-- moves off 'sent' back to 'draft', clear sent_at so it isn't stale.

create or replace function public.sync_sent_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'sent' and new.sent_at is null then
    new.sent_at := now();
  elsif new.status = 'draft' then
    new.sent_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_sent_at on public.invoices;
create trigger trg_sync_sent_at
  before insert or update on public.invoices
  for each row execute function public.sync_sent_at();

drop trigger if exists trg_sync_sent_at on public.quotes;
create trigger trg_sync_sent_at
  before insert or update on public.quotes
  for each row execute function public.sync_sent_at();
