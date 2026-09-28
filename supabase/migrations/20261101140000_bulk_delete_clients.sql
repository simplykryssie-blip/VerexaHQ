-- Contacts reconciliation gap #1: hard delete has never existed for clients
-- (HANDOFF.md's own "Contacts deferred" list still names it explicitly) --
-- confirmed via direct schema audit that a raw `delete from clients` would
-- already be RLS-permitted today for Owner/Admin/ERO (clients.delete exists
-- and is granted, with a DELETE policy already in place), but nothing wires
-- it up: no RPC, no UI, and the client_id foreign keys are a genuine mix --
-- most tables (tasks, notes... no, notes is polymorphic, see below;
-- appointments, automation_runs, client_addresses/contacts/emails/phones,
-- client_ledger, client_pending_changes, client_portal_users,
-- client_relationships, client_service_interests, communication_preferences,
-- engagement_letter_public_signatures, irs_authorizations,
-- organizer_responses, payment_methods, pending_engagement_letter_sends,
-- pending_portal_invites, recurring_billing, tasks) cascade automatically,
-- but engagements/invoices/payments/quotes use ON DELETE with no cascade
-- action at all -- a raw delete on a client with any of those would simply
-- fail with an opaque FK-violation error. That RESTRICT-by-default set is
-- exactly the schema's own existing signal for "this contact has become an
-- established client" (Product Decision, this reconciliation): a hard
-- delete is only offered when none of those four exist for the contact.
--
-- attachments/notes/document_requests/message_threads are polymorphic
-- (entity_type/entity_id, no FK to clients at all) so cascade delete never
-- touches them -- left alone, a hard-deleted contact would leave orphaned
-- rows in all four forever. Explicitly cleaned up below. messages cascades
-- from message_threads on its own FK, so deleting the thread is enough.
--
-- A small number of attachments-referencing FKs (attachments.replaces_attachment_id,
-- document_request_item_statuses.fulfilled_by_attachment_id,
-- signature_requests.final_pdf_attachment_id) have no ON DELETE action of
-- their own (default RESTRICT) -- rather than hunting every such edge case
-- across a 300+ table schema and risking missing one, each contact's delete
-- attempt is wrapped in its own exception handler so an unexpected
-- RESTRICT violation is reported back as "could not delete" for that one
-- contact instead of aborting the whole batch (or silently succeeding for
-- everyone before it).
create or replace function public.delete_clients(p_client_ids uuid[])
returns table (client_id uuid, deleted boolean, reason text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_workspace_id uuid;
  v_engagement_count int;
  v_invoice_count int;
  v_payment_count int;
  v_quote_count int;
  v_blockers text[];
begin
  if p_client_ids is null or array_length(p_client_ids, 1) is null then
    return;
  end if;
  if array_length(p_client_ids, 1) > 500 then
    raise exception 'Cannot delete more than 500 contacts in a single request';
  end if;

  foreach v_id in array p_client_ids loop
    select workspace_id into v_workspace_id from public.clients where id = v_id;
    if v_workspace_id is null then
      client_id := v_id; deleted := false; reason := 'Contact not found';
      return next;
      continue;
    end if;

    if not public.has_permission(v_workspace_id, 'clients.delete') then
      client_id := v_id; deleted := false; reason := 'Insufficient permissions';
      return next;
      continue;
    end if;
    if not public.is_workspace_operational(v_workspace_id) then
      client_id := v_id; deleted := false; reason := 'Workspace is not currently operational';
      return next;
      continue;
    end if;

    -- Table-qualified: this function's own OUT/return column is also named
    -- client_id, and an unqualified reference here is ambiguous between it
    -- and the queried table's column (caught live -- see PR description).
    select count(*) into v_engagement_count from public.engagements where engagements.client_id = v_id;
    select count(*) into v_invoice_count from public.invoices where invoices.client_id = v_id;
    select count(*) into v_payment_count from public.payments where payments.client_id = v_id;
    select count(*) into v_quote_count from public.quotes where quotes.client_id = v_id;

    v_blockers := array[]::text[];
    if v_engagement_count > 0 then v_blockers := v_blockers || format('%s engagement(s)', v_engagement_count); end if;
    if v_invoice_count > 0 then v_blockers := v_blockers || format('%s invoice(s)', v_invoice_count); end if;
    if v_payment_count > 0 then v_blockers := v_blockers || format('%s payment(s)', v_payment_count); end if;
    if v_quote_count > 0 then v_blockers := v_blockers || format('%s quote(s)', v_quote_count); end if;

    if array_length(v_blockers, 1) > 0 then
      client_id := v_id; deleted := false;
      reason := 'Has become an established client (' || array_to_string(v_blockers, ', ') || ') -- archive instead of deleting';
      return next;
      continue;
    end if;

    begin
      delete from public.attachments where entity_type = 'client' and entity_id = v_id;
      delete from public.notes where entity_type = 'client' and entity_id = v_id;
      delete from public.document_requests where entity_type = 'client' and entity_id = v_id;
      delete from public.message_threads where entity_type = 'client' and entity_id = v_id;
      delete from public.clients where id = v_id;
      client_id := v_id; deleted := true; reason := null;
    exception when others then
      client_id := v_id; deleted := false; reason := 'Could not delete: ' || sqlerrm;
    end;
    return next;
  end loop;
end;
$$;

revoke all on function public.delete_clients(uuid[]) from public, anon;
grant execute on function public.delete_clients(uuid[]) to authenticated;
