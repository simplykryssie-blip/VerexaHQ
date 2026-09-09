-- workspace_users had two permissive SELECT policies for the same
-- authenticated role: workspace_users_select (is_workspace_member(workspace_id))
-- and workspace_users_select_platform_admin (is_platform_admin()).
-- is_workspace_member() already ORs in is_platform_admin() internally, so
-- the second policy is provably redundant -- Postgres evaluates every
-- permissive policy on a table for every row, doubling is_platform_admin()'s
-- cost on getCurrentWorkspace(), which runs on nearly every authenticated
-- page load. Dropped.
--
-- workspaces carries the same *shape* of duplicate policy
-- (workspaces_select_platform_admin), but it is NOT redundant and is left
-- alone: its qual is is_platform_it(), which also covers plain Platform IT
-- staff (is_platform_it = true, is_platform_admin = false) -- a real,
-- distinct grant that workspaces_select's is_workspace_member(id) does not
-- cover. Dropping it would remove Platform IT's visibility into every
-- workspace (e.g. the /platform-admin/systems workspace list).
-- Found by the first Verexa Performance Agent run; its premise ("each
-- carry a redundant policy") only held for workspace_users on inspection.

drop policy if exists workspace_users_select_platform_admin on public.workspace_users;
