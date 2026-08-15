-- Read access for the platform-admin dashboard: a platform admin (a single
-- Verexa-operator flag on user_profiles, not a workspace role) needs to see
-- every workspace and its roster to run the business, not just their own.
-- workspace_subscriptions/workspace_subscription_invoices already had this
-- bypass; workspaces/workspace_users/firm_connections did not.
create policy "workspaces_select_platform_admin" on public.workspaces
for select
using (is_platform_admin());

create policy "workspace_users_select_platform_admin" on public.workspace_users
for select
using (is_platform_admin());

create policy "firm_connections_select_platform_admin" on public.firm_connections
for select
using (is_platform_admin());
