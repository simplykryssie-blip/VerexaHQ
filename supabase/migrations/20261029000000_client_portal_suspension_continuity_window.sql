-- P1 release reconciliation: client portal access during workspace
-- suspension did not match the locked lifecycle policy
-- (ACTIVE -> SUSPENDED -> ARCHIVED -> PERMANENTLY_ARCHIVED). The policy is
-- specifically "Suspended Day 0-30 = limited existing-client portal
-- continuity; Day 30 (Archived) = portal shuts off" -- not "portal open
-- during all suspension" and not "portal closed immediately on
-- suspension."
--
-- History (both already-shipped, already-decided at the time, neither one
-- matching the actual policy above):
--   - 20261016000000 first split the operational gate onto RLS policies
--     and *deliberately left the client-portal branch of
--     organizer_responses/message_threads/messages completely unguarded*
--     ("a firm's billing suspension must never block its own clients").
--     That is too permissive against the real policy: it leaves the
--     portal open forever, through Archived and Permanently Archived too.
--   - 20260916150000 reversed that by ANDing is_workspace_operational()
--     (status = 'active' only) onto the same client-portal branches. That
--     is too strict against the real policy: it closes the portal at Day
--     0 of suspension instead of Day 30.
-- Neither prior state is being reopened or re-litigated -- both were
-- already-made calls that simply didn't implement the current, specific
-- Day 0-30 policy, because that specific window didn't exist as a
-- concept in either migration.
--
-- Fix: a new, narrowly-scoped function reusing the exact same canonical
-- suspended_at timestamp the already-shipped Day 30/90 archive cron
-- (app/api/cron/process-workspace-archive-lifecycle/route.ts,
-- ARCHIVE_AFTER_DAYS = 30) already measures from -- no second lifecycle
-- clock. A null suspended_at (a workspace suspended before that column
-- existed) is treated as still-in-window, mirroring that same cron's own
-- documented safe default ("never archive-eligible" when there's no real
-- start time to measure from) -- consistent in the same direction, not a
-- separate policy call.
--
-- This function is used ONLY on the client-portal branch of each affected
-- policy below. The staff/has_permission branch of every one of these
-- policies keeps is_workspace_operational() exactly as it already had it
-- (or, for the two policies that never had any operational check on
-- either branch -- client_documents_insert and
-- organizer_response_answers_insert/update -- the staff branch is left
-- exactly as-is; that gap is pre-existing, unrelated to this window fix,
-- and out of this task's scope). is_workspace_operational() itself is not
-- modified, so no other suspension gate (staff shell, automations,
-- integrations, billing administration, CRM operations) is affected by
-- this migration.
create or replace function public.is_client_portal_window_active(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select w.status = 'active'
        or (w.status = 'suspended' and (w.suspended_at is null or w.suspended_at > now() - interval '30 days'))
     from public.workspaces w
     where w.id = p_workspace_id),
    false
  );
$function$;

-- organizer_responses: portal branch was is_workspace_operational (Day 0
-- shutoff) -> swapped to the window function.
alter policy organizer_responses_insert on public.organizer_responses
  with check (
    (has_permission(workspace_id, 'engagements.manage'::text) and is_workspace_operational(workspace_id))
    or (is_portal_user(client_id) and (status = any (array['not_started'::text, 'in_progress'::text])) and is_client_portal_window_active(workspace_id))
  );

alter policy organizer_responses_update on public.organizer_responses
  using (
    (has_permission(workspace_id, 'engagements.manage'::text) and is_workspace_operational(workspace_id))
    or (is_portal_user(client_id) and (status = any (array['not_started'::text, 'in_progress'::text])) and is_client_portal_window_active(workspace_id))
  );

-- organizer_response_answers: the actual answer content of an organizer
-- response a client is completing. Had no operational check at all on
-- either branch, so a client could otherwise keep editing answers on an
-- already-open response indefinitely, including past Archived, even
-- though the parent organizer_responses row is itself correctly gated.
-- Portal branch only; staff branch left exactly as-is (pre-existing,
-- unrelated to this fix).
alter policy organizer_response_answers_insert on public.organizer_response_answers
  with check (
    (exists (select 1 from public.organizer_responses r where r.id = organizer_response_answers.organizer_response_id and has_permission(r.workspace_id, 'engagements.manage'::text)))
    or (exists (select 1 from public.organizer_responses r where r.id = organizer_response_answers.organizer_response_id and is_portal_user(r.client_id) and (r.status = any (array['not_started'::text, 'in_progress'::text])) and is_client_portal_window_active(r.workspace_id)))
  );

alter policy organizer_response_answers_update on public.organizer_response_answers
  using (
    (exists (select 1 from public.organizer_responses r where r.id = organizer_response_answers.organizer_response_id and has_permission(r.workspace_id, 'engagements.manage'::text)))
    or (exists (select 1 from public.organizer_responses r where r.id = organizer_response_answers.organizer_response_id and is_portal_user(r.client_id) and (r.status = any (array['not_started'::text, 'in_progress'::text])) and is_client_portal_window_active(r.workspace_id)))
  );

-- message_threads / messages: portal branch was is_workspace_operational
-- (Day 0 shutoff) -> swapped to the window function.
alter policy message_threads_write on public.message_threads
  with check (
    (has_permission(workspace_id, 'messages.view'::text) and is_workspace_operational(workspace_id))
    or ((entity_type = 'client'::text) and is_portal_user(entity_id) and (created_by = ( select auth.uid() )) and is_client_portal_window_active(workspace_id))
  );

alter policy messages_write on public.messages
  with check (
    (has_permission(workspace_id, 'messages.send'::text) and is_workspace_operational(workspace_id))
    or (is_internal and has_permission(workspace_id, 'messages.internal_note'::text) and is_workspace_operational(workspace_id))
    or ((sender_type = 'client'::text) and (is_internal = false) and (sender_id = ( select auth.uid() )) and (exists (
      select 1 from public.message_threads t where ((t.id = messages.thread_id) and is_portal_user_for_entity(t.entity_type, t.entity_id))
    )) and is_client_portal_window_active(workspace_id))
  );

-- attachments (client_documents_insert): the client-visible portal-upload
-- branch had no operational check at all, so a client could upload
-- documents through Archived/Permanently Archived, not just through the
-- Day 0-30 window the policy actually grants. Adds the window check to
-- that one branch only; the staff branch and the partner-firm-connection
-- branch are untouched (both pre-existing, neither in scope here).
alter policy client_documents_insert on public.attachments
  with check (
    (has_permission(workspace_id, 'documents.upload'::text) and (uploaded_by = ( select auth.uid() )))
    or ((visibility = 'client_visible'::text) and (uploaded_by = ( select auth.uid() )) and is_portal_user_for_entity(entity_type, entity_id) and is_client_portal_window_active(workspace_id))
    or ((uploaded_by = ( select auth.uid() )) and is_partner_workspace_for_firm_connection(workspace_id, entity_type, entity_id))
  );
