-- Dashboard widget consolidation pass: four cards were merged into existing
-- sibling widget slots rather than added as new ones (see DashboardShell's
-- renderWidget() and lib/dashboard/widgets.ts):
--   'kpis'               -> now renders "Engagements" (Open + Unassigned)
--   'calendar'           -> now renders "Today" (Tasks Due Today + Calendar)
--   'missing_documents'  -> now renders "Client Requests" (Missing Docs + Overdue Requests)
--   'engagement_pipeline'-> now also includes the former Stage Breakdown donut
-- 'unassigned_engagements', 'overdue_requests', 'stage_breakdown', and
-- 'failed_automations' are retired the same way 'returns_due' etc. already
-- were: dropped from IMPLEMENTED_WIDGET_TYPES (app-side only) so they no
-- longer render or show up in Customize. This migration does NOT delete any
-- dashboard_widgets or user_widget_preferences row and does NOT touch the
-- widget_type CHECK constraint -- both stay exactly as they were, so every
-- existing user's saved visibility/order preference for every widget
-- (including the four retired ones, which simply become inert) is
-- preserved untouched. The only change here is cosmetic: fixing the stored
-- `title` on the four repurposed slots so the Customize list shows their
-- new name instead of the old one, and updating the new-workspace seed list
-- so newly created dashboards don't seed the four retired types at all.

-- 1. Fix titles on existing dashboards' repurposed widget rows. UPDATE-only,
--    no rows added or removed.
update public.dashboard_widgets set title = 'Engagements' where widget_type = 'kpis' and title = 'Engagements & Tasks';
update public.dashboard_widgets set title = 'Today' where widget_type = 'calendar' and title = 'Calendar';
update public.dashboard_widgets set title = 'Client Requests' where widget_type = 'missing_documents' and title = 'Missing Documents';
-- 'engagement_pipeline' already carries the exact right title ("Engagement
-- Pipeline") from the original seed, so no update needed there.

-- 2. New-workspace seed list: stop seeding the four now-retired widget
-- types, and use the new titles for the four repurposed ones. Existing
-- dashboards are untouched by this function (the v_widget_count = 0 guard
-- only ever fires for a brand-new dashboard).
create or replace function public.ensure_default_dashboard(p_workspace_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_dashboard_id uuid;
  v_widget_count int;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace';
  end if;

  select id into v_dashboard_id from public.dashboards
  where workspace_id = p_workspace_id and is_default limit 1;

  if v_dashboard_id is null then
    insert into public.dashboards (workspace_id, name, slug, is_default, status, created_by)
    values (p_workspace_id, 'Executive Dashboard', 'executive', true, 'published', auth.uid())
    returning id into v_dashboard_id;
  end if;

  select count(*) into v_widget_count from public.dashboard_widgets where dashboard_id = v_dashboard_id;

  if v_widget_count = 0 then
    insert into public.dashboard_widgets (dashboard_id, widget_type, title, display_order, config)
    values
      (v_dashboard_id, 'revenue', 'Revenue This Month', 1, '{}'::jsonb),
      (v_dashboard_id, 'kpis', 'Engagements', 2, '{}'::jsonb),
      (v_dashboard_id, 'collections', 'Outstanding Invoices', 3, '{}'::jsonb),
      (v_dashboard_id, 'missing_documents', 'Client Requests', 4, '{}'::jsonb),
      (v_dashboard_id, 'messages', 'Open Client Messages', 5, '{}'::jsonb),
      (v_dashboard_id, 'todays_work', 'Today''s Priorities', 6, '{}'::jsonb),
      (v_dashboard_id, 'review_queue', 'Review Queue', 7, '{}'::jsonb),
      (v_dashboard_id, 'quick_actions', 'Quick Actions', 8, '{}'::jsonb),
      (v_dashboard_id, 'calendar', 'Today', 9, '{}'::jsonb),
      (v_dashboard_id, 'recent_activity', 'Recent Activity', 10, '{}'::jsonb),
      (v_dashboard_id, 'top_services', 'Top Services', 11, '{}'::jsonb),
      (v_dashboard_id, 'engagement_pipeline', 'Engagement Pipeline', 12, '{}'::jsonb),
      (v_dashboard_id, 'deadline_risk', 'Deadline Risk', 13, '{}'::jsonb);
  end if;

  return v_dashboard_id;
end;
$$;
