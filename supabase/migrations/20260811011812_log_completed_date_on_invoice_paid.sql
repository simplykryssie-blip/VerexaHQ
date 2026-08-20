-- completed_date already gets set automatically when an engagement's status
-- moves to 'Completed' (record_engagement_status_change). This adds the
-- other half: a return can also be considered done once its invoice is
-- funded/paid, even before staff flip the engagement's status. Only fills a
-- blank completed_date -- never overwrites whichever happened first.

create or replace function public.log_engagement_completed_on_invoice_paid()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'paid' and old.status is distinct from new.status and new.engagement_id is not null then
    update public.engagements
    set completed_date = coalesce(completed_date, now())
    where id = new.engagement_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_log_engagement_completed_on_invoice_paid on public.invoices;
create trigger trg_log_engagement_completed_on_invoice_paid
  after update of status on public.invoices
  for each row execute function public.log_engagement_completed_on_invoice_paid();
