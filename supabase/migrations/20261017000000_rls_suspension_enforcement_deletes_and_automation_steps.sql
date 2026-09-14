-- Phase 3 final mutation-gap closure. The previous security-closure pass
-- (20261016000000) flagged but did not fix six remaining mutation policies
-- as a residual gap: engagements/messages/message_threads admin-only DELETE,
-- and all three automation_steps mutation policies. This pass proved all
-- six live against the Summit Tax & Financial Services demo workspace (a
-- non-platform-admin admin -- temporarily role-elevated from a real
-- administrative_staff member, then reverted -- deleted a real engagement,
-- message, and message_thread row while the workspace was suspended; a
-- non-admin staff member with automations.manage inserted, updated, and
-- deleted automation_steps rows on a workspace-scoped automation while
-- suspended) before making any change.
--
-- Same fix pattern as 20261016000000: AND the existing reusable
-- is_workspace_operational(workspace_id) onto the existing authorization
-- check via ALTER POLICY, preserving every other property of each policy.
-- No new function, no change to SELECT policies, billing tables, client
-- portal branches, or platform-admin behavior (is_workspace_operational
-- already ORs in is_platform_admin()).

alter policy engagements_delete on public.engagements
  using (is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));

alter policy message_threads_delete on public.message_threads
  using (is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));

alter policy messages_delete on public.messages
  using (is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));

-- automation_steps has no workspace_id column of its own -- workspace
-- scoping is derived through automation_id -> automations.workspace_id,
-- which the existing EXISTS clause already joins to for the permission
-- check. Add the operational check inside the same EXISTS.
alter policy automation_steps_insert on public.automation_steps
  with check (exists (
    select 1 from automations a
    where a.id = automation_steps.automation_id
      and a.workspace_id is not null
      and has_permission(a.workspace_id, 'automations.manage'::text)
      and is_workspace_operational(a.workspace_id)
  ));

alter policy automation_steps_update on public.automation_steps
  using (exists (
    select 1 from automations a
    where a.id = automation_steps.automation_id
      and a.workspace_id is not null
      and has_permission(a.workspace_id, 'automations.manage'::text)
      and is_workspace_operational(a.workspace_id)
  ));

alter policy automation_steps_delete on public.automation_steps
  using (exists (
    select 1 from automations a
    where a.id = automation_steps.automation_id
      and a.workspace_id is not null
      and has_permission(a.workspace_id, 'automations.manage'::text)
      and is_workspace_operational(a.workspace_id)
  ));
