-- Epic 4: hybrid client ownership model.
-- Clients get permanent default staff assignments; engagements inherit them at
-- creation time but may override independently thereafter. Nothing here
-- replaces engagements.assigned_staff_id/reviewer_id/compliance_officer_id --
-- those remain the source of truth for a given engagement.

alter table public.clients
  add column if not exists relationship_manager_id uuid references public.user_profiles(id),
  add column if not exists default_reviewer_id uuid references public.user_profiles(id),
  add column if not exists default_compliance_officer_id uuid references public.user_profiles(id);

create index if not exists idx_clients_relationship_manager on public.clients(relationship_manager_id) where relationship_manager_id is not null;
create index if not exists idx_clients_default_reviewer on public.clients(default_reviewer_id) where default_reviewer_id is not null;
create index if not exists idx_clients_default_compliance_officer on public.clients(default_compliance_officer_id) where default_compliance_officer_id is not null;

-- Auto-prefill a new engagement's assignments from its client's defaults
-- whenever the caller didn't set them explicitly. Runs regardless of which
-- code path performs the insert (app, RPC, future integration).
create or replace function public.prefill_engagement_assignments()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_client record;
begin
  if new.assigned_staff_id is null or new.reviewer_id is null or new.compliance_officer_id is null then
    select relationship_manager_id, default_reviewer_id, default_compliance_officer_id
      into v_client
      from public.clients
      where id = new.client_id;

    if v_client is not null then
      new.assigned_staff_id := coalesce(new.assigned_staff_id, v_client.relationship_manager_id);
      new.reviewer_id := coalesce(new.reviewer_id, v_client.default_reviewer_id);
      new.compliance_officer_id := coalesce(new.compliance_officer_id, v_client.default_compliance_officer_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prefill_engagement_assignments on public.engagements;
create trigger trg_prefill_engagement_assignments
  before insert on public.engagements
  for each row execute function public.prefill_engagement_assignments();
