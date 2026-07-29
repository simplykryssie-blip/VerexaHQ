-- Security fix: without security_invoker, this view evaluates RLS as its
-- owner rather than the querying user, which could expose every
-- workspace's billing/subscription data to any authenticated caller. All
-- underlying tables (workspaces, workspace_subscriptions, clients,
-- workspace_members) already carry workspace-scoped RLS policies
-- (is_workspace_member / portal_can_see / etc.), and this matches the
-- security_invoker=true convention already used on essentially every other
-- workspace-scoped view in this schema -- the previous drop+recreate
-- migration lost that reloption because it wasn't carried over explicitly.
alter view public.v_workspace_subscription_summary set (security_invoker = true);
