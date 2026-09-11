-- Workspace members need to read their own usage/balance for the new
-- Settings > Plan & Usage page -- the earlier migration only granted
-- platform admins select access.
create policy "Workspace members can view their own usage meters"
  on public.workspace_usage_meters for select
  using (public.is_workspace_member(workspace_id));
