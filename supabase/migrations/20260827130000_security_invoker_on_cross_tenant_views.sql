-- v_reviewer_queue, v_engagement_progress, v_workflow_sla_status, and
-- v_tax_season_metrics are all SELECT-granted to anon and authenticated,
-- but none had security_invoker set -- so they ran with the view owner's
-- privileges, bypassing RLS on the underlying pipeline_stages/pipeline_runs/
-- engagements tables entirely. The app always adds its own workspace_id
-- filter when querying these, but nothing stopped a direct PostgREST call
-- (GET /rest/v1/v_reviewer_queue with just an authenticated JWT, or even
-- the anon key) from reading every workspace's reviewer queue, engagement
-- progress, SLA status, and tax-season/IRS-notice metrics with no
-- workspace filter at all. security_invoker makes each view run under the
-- querying user's own permissions, so the real RLS policies on the
-- underlying tables (already correctly workspace-scoped, per audit) apply
-- to every query against these views too, direct or otherwise.
alter view public.v_reviewer_queue set (security_invoker = true);
alter view public.v_engagement_progress set (security_invoker = true);
alter view public.v_workflow_sla_status set (security_invoker = true);
alter view public.v_tax_season_metrics set (security_invoker = true);
