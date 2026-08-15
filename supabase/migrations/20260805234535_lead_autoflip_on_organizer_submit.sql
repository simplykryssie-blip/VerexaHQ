-- A client stays "lead" until they've actually engaged -- completing an
-- organizer is the signal staff asked for. Trigger on organizer_responses
-- rather than requiring staff to remember to flip the status manually.

create or replace function public.flip_lead_on_organizer_submission()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status in ('submitted', 'reviewed')
     and (old.status is null or old.status not in ('submitted', 'reviewed')) then
    update public.clients
      set lifecycle_status = 'active'
      where id = new.client_id and lifecycle_status = 'lead';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_flip_lead_on_organizer_submission on public.organizer_responses;
create trigger trg_flip_lead_on_organizer_submission
  after insert or update on public.organizer_responses
  for each row execute function public.flip_lead_on_organizer_submission();
