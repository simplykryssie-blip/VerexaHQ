-- Phase 3 security-closure pass. Proved live (Summit Tax & Financial
-- Services, is_demo=true, suspended via set_workspace_status): a regular
-- non-admin staff member with automations.manage could still INSERT a real
-- row into public.automations directly through Supabase while the
-- workspace was suspended -- the app/(app)/layout.tsx gate from Phase 3
-- only blocks Next.js page loads and the API routes that call
-- getCurrentWorkspace(); it has no effect on direct-to-Supabase calls,
-- which is how most CRUD in this app actually happens.
--
-- Root cause: nearly every operational mutation policy in this schema
-- (279 call sites) is gated by has_permission(workspace_id, key), which
-- checks role/permission membership only -- never workspace.status.
-- has_permission() itself is NOT modified here: it also gates read
-- policies and workspace-settings/billing-adjacent tables (e.g.
-- workspaces_update, attachments_select, used by Settings > Plan & Usage
-- itself), so a blanket change there would risk breaking the one page
-- suspension must always leave reachable. Instead: one new, narrowly-scoped
-- function, applied via ALTER POLICY (preserves every other property of
-- each existing policy) to only the specific staff-mutation policies on
-- the highest-value operational tables identified in the investigation.
--
-- Billing/subscription tables (workspace_subscriptions, workspace_usage_meters,
-- workspace_billing_charge_attempts, workspace_phone_numbers, etc.) are
-- deliberately untouched.
create or replace function public.is_workspace_operational(p_workspace_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce((select status from public.workspaces where id = p_workspace_id) = 'active', false)
    or public.is_platform_admin();
$function$;

revoke all on function public.is_workspace_operational(uuid) from public;
grant execute on function public.is_workspace_operational(uuid) to authenticated, service_role;
-- revoke all ... from public does not touch a role separately granted
-- execute by default -- anon still had it until this explicit revoke.
-- Confirmed via has_function_privilege() that is_workspace_member and
-- is_workspace_admin (the sibling SECURITY DEFINER helpers) were never
-- exposed to anon; this brings this function in line with that pattern.
revoke execute on function public.is_workspace_operational(uuid) from anon;

-- Clean wraps: every branch of the existing expression is staff-only (no
-- client-portal access mixed in), so the whole thing is AND'd with the new
-- check.
alter policy clients_delete on public.clients
  using (has_permission(workspace_id, 'clients.delete'::text) and is_workspace_operational(workspace_id));

alter policy clients_update on public.clients
  using (has_permission(workspace_id, 'clients.edit'::text) and is_workspace_operational(workspace_id))
  with check (has_permission(workspace_id, 'clients.edit'::text) and is_workspace_operational(workspace_id));

alter policy engagements_insert on public.engagements
  with check (has_permission(workspace_id, 'engagements.manage'::text) and is_workspace_operational(workspace_id));

alter policy engagements_update on public.engagements
  using ((has_permission(workspace_id, 'engagements.manage'::text) or has_permission(workspace_id, 'engagements.assign'::text)) and is_workspace_operational(workspace_id))
  with check ((has_permission(workspace_id, 'engagements.manage'::text) or has_permission(workspace_id, 'engagements.assign'::text)) and is_workspace_operational(workspace_id));

alter policy automations_insert on public.automations
  with check (workspace_id is not null and has_permission(workspace_id, 'automations.manage'::text) and is_workspace_operational(workspace_id));

alter policy automations_update on public.automations
  using (workspace_id is not null and has_permission(workspace_id, 'automations.manage'::text) and is_workspace_operational(workspace_id));

alter policy automations_delete on public.automations
  using (workspace_id is not null and has_permission(workspace_id, 'automations.manage'::text) and is_workspace_operational(workspace_id));

alter policy tasks_insert on public.tasks
  with check (has_permission(workspace_id, 'engagements.manage'::text) and is_workspace_operational(workspace_id));

alter policy tasks_update on public.tasks
  using ((has_permission(workspace_id, 'engagements.manage'::text) or (( select auth.uid() ) = assigned_staff_id)) and is_workspace_operational(workspace_id))
  with check ((has_permission(workspace_id, 'engagements.manage'::text) or (( select auth.uid() ) = assigned_staff_id)) and is_workspace_operational(workspace_id));

alter policy tasks_delete on public.tasks
  using (has_permission(workspace_id, 'engagements.manage'::text) and is_workspace_operational(workspace_id));

alter policy site_pages_insert on public.site_pages
  with check (has_permission(workspace_id, 'site_pages.manage'::text) and is_workspace_operational(workspace_id));

alter policy site_pages_update on public.site_pages
  using (has_permission(workspace_id, 'site_pages.manage'::text) and is_workspace_operational(workspace_id));

alter policy site_pages_delete on public.site_pages
  using (has_permission(workspace_id, 'site_pages.manage'::text) and is_workspace_operational(workspace_id));

alter policy site_websites_insert on public.site_websites
  with check (has_permission(workspace_id, 'site_pages.manage'::text) and is_workspace_operational(workspace_id));

alter policy site_websites_update on public.site_websites
  using (has_permission(workspace_id, 'site_pages.manage'::text) and is_workspace_operational(workspace_id));

alter policy site_websites_delete on public.site_websites
  using (has_permission(workspace_id, 'site_pages.manage'::text) and is_workspace_operational(workspace_id));

alter policy workspace_users_insert on public.workspace_users
  with check (has_permission(workspace_id, 'users.manage'::text) and is_workspace_operational(workspace_id));

-- Surgical wraps: only the staff/has_permission branch of each OR is
-- touched. The client-portal branch is left completely untouched, per the
-- locked product decision that a firm's billing suspension must never
-- block its own clients from using their portal (submitting an organizer
-- response, sending a portal message).
alter policy organizer_responses_delete on public.organizer_responses
  using (has_permission(workspace_id, 'engagements.manage'::text) and is_workspace_operational(workspace_id));

alter policy organizer_responses_insert on public.organizer_responses
  with check (
    (has_permission(workspace_id, 'engagements.manage'::text) and is_workspace_operational(workspace_id))
    or (is_portal_user(client_id) and (status = any (array['not_started'::text, 'in_progress'::text])))
  );

alter policy organizer_responses_update on public.organizer_responses
  using (
    (has_permission(workspace_id, 'engagements.manage'::text) and is_workspace_operational(workspace_id))
    or (is_portal_user(client_id) and (status = any (array['not_started'::text, 'in_progress'::text])))
  );

alter policy message_threads_write on public.message_threads
  with check (
    (has_permission(workspace_id, 'messages.view'::text) and is_workspace_operational(workspace_id))
    or ((entity_type = 'client'::text) and is_portal_user(entity_id) and (created_by = ( select auth.uid() )))
  );

alter policy messages_write on public.messages
  with check (
    (has_permission(workspace_id, 'messages.send'::text) and is_workspace_operational(workspace_id))
    or (is_internal and has_permission(workspace_id, 'messages.internal_note'::text) and is_workspace_operational(workspace_id))
    or ((sender_type = 'client'::text) and (is_internal = false) and (sender_id = ( select auth.uid() )) and (exists (
      select 1 from message_threads t where ((t.id = messages.thread_id) and is_portal_user_for_entity(t.entity_type, t.entity_id))
    )))
  );
