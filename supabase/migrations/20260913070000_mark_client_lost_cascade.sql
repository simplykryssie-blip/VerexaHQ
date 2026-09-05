-- Generalizes "mark lost" from leads-only to any client. Marking an
-- already-engaged client lost also closes out her open work in one atomic
-- step (per user decision: auto-cancel rather than leave orphaned open
-- records) so she immediately drops out of every dashboard count that
-- exists to flag ACTIONABLE work -- unassigned engagements, missing
-- documents, overdue requests, outstanding invoices all already filter to
-- open/not-void/not-cancelled, so archiving/voiding/cancelling her records
-- here is the only change needed; reports like /reports/clients that break
-- clients down BY lifecycle_status are untouched and will keep showing her
-- correctly as "lost".

create or replace function public.mark_client_lost(p_client_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.clients where id = p_client_id;
  if v_workspace_id is null then
    raise exception 'Client not found';
  end if;
  if not public.has_permission(v_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions';
  end if;

  update public.clients
  set lifecycle_status = 'lost', lost_reason = p_reason, lost_at = now()
  where id = p_client_id;

  update public.engagements
  set status = 'Archived', archived_date = now()
  where client_id = p_client_id
    and status not in ('Completed', 'Archived');

  update public.invoices
  set status = 'void'
  where client_id = p_client_id
    and status not in ('paid', 'void');

  update public.document_requests
  set status = 'cancelled'
  where status = 'open'
    and (
      (entity_type = 'client' and entity_id = p_client_id)
      or (entity_type = 'engagement' and entity_id in (select id from public.engagements where client_id = p_client_id))
    );
end;
$$;
