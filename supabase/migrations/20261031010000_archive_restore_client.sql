-- CONTACTS COMPLETION PASS -- Phase 2: canonical client archive/restore
-- mechanism (VEREXAHQ Contacts Reconciliation Audit, Product Decision #14).
--
-- Deliberately modeled on mark_client_lost (20260913070000_mark_client_lost_cascade.sql)
-- -- same permission gate, same atomic-cascade style -- but a *lighter*
-- cascade, because archive means "done working with them for now, not
-- gone/lost" and must be fully reversible:
--   * engagements: close out open ones (same action mark_client_lost takes)
--     -- an archived client shouldn't have dangling open engagements.
--   * document requests: cancel open ones (same action mark_client_lost
--     takes) -- no point leaving open requests for someone no longer being
--     actively worked.
--   * invoices: deliberately left UNTOUCHED (mark_client_lost voids them,
--     because lost = churn risk; archive is often the *opposite* -- the
--     work finished and was paid -- so voiding here would be financially
--     destructive and wrong).
--   * tasks, documents, messages, appointments, portal access: left
--     untouched, matching mark_client_lost's own scope (it doesn't touch
--     these either) and avoiding a new touch into portal auth, which has no
--     existing lifecycle_status gating to extend.
--   * workflows/automations: no new code needed -- two existing call sites
--     (round-robin staff-workload counting, birthday-reminder automation)
--     already exclude lifecycle_status in ('archived','lost') together;
--     this activates automatically once 'archived' data actually exists.
--   * restore: single reactivation target ('active'), matching the
--     existing lost->active transition already coded in the automation
--     engine (execute_automation_step, action_type = 'client_type'... see
--     baseline schema ~line 7176) -- does not auto-reopen engagements or
--     document requests that were closed on archive, since those were
--     closed deliberately and auto-reopening stale items is a real risk.

create or replace function public.archive_client(p_client_id uuid)
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
  set lifecycle_status = 'archived'
  where id = p_client_id;

  update public.engagements
  set status = 'Archived', archived_date = now()
  where client_id = p_client_id
    and status not in ('Completed', 'Archived');

  update public.document_requests
  set status = 'cancelled'
  where status = 'open'
    and (
      (entity_type = 'client' and entity_id = p_client_id)
      or (entity_type = 'engagement' and entity_id in (select id from public.engagements where client_id = p_client_id))
    );
end;
$$;

create or replace function public.restore_client(p_client_id uuid)
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
  set lifecycle_status = 'active'
  where id = p_client_id;
end;
$$;
