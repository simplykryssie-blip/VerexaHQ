-- Two new dashboard widget types for the visual redesign's Phase 3:
-- 'top_services' (donut chart of open engagements by service) and
-- 'engagement_pipeline' (a horizontal strip of real engagements.status
-- counts, in the same order as the engagements_status_check constraint --
-- not tied to pipeline_runs, which today only has entity_type='client'
-- (lead) rows; engagement-side stage tracking lives on engagements.status
-- directly).

alter table public.dashboard_widgets drop constraint dashboard_widgets_widget_type_check;
alter table public.dashboard_widgets
  add constraint dashboard_widgets_widget_type_check
  check (widget_type = any (array[
    'todays_work', 'missing_documents', 'review_queue', 'returns_due', 'signatures_pending',
    'messages', 'revenue', 'collections', 'kpis', 'staff_workload', 'client_health', 'compliance',
    'quick_actions', 'calendar', 'recent_activity', 'active_customers', 'upcoming_renewals',
    'payment_failures', 'top_services', 'engagement_pipeline'
  ]));

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
      (v_dashboard_id, 'kpis', 'Engagements & Tasks', 2, '{}'::jsonb),
      (v_dashboard_id, 'collections', 'Outstanding Invoices', 3, '{}'::jsonb),
      (v_dashboard_id, 'missing_documents', 'Missing Documents', 4, '{}'::jsonb),
      (v_dashboard_id, 'messages', 'Open Client Messages', 5, '{}'::jsonb),
      (v_dashboard_id, 'todays_work', 'Today''s Priorities', 6, '{}'::jsonb),
      (v_dashboard_id, 'review_queue', 'Review Queue', 7, '{}'::jsonb),
      (v_dashboard_id, 'quick_actions', 'Quick Actions', 8, '{}'::jsonb),
      (v_dashboard_id, 'calendar', 'Calendar', 9, '{}'::jsonb),
      (v_dashboard_id, 'recent_activity', 'Recent Activity', 10, '{}'::jsonb),
      (v_dashboard_id, 'top_services', 'Top Services', 11, '{}'::jsonb),
      (v_dashboard_id, 'engagement_pipeline', 'Engagement Pipeline', 12, '{}'::jsonb);
  end if;

  return v_dashboard_id;
end;
$$;

-- Backfill: every dashboard that predates this migration is missing the two
-- new widgets entirely (the count-based seed guard in ensure_default_dashboard
-- only fires for a brand-new dashboard) -- add them, visible, appended after
-- whatever that dashboard already has.
insert into public.dashboard_widgets (dashboard_id, widget_type, title, display_order, is_visible, config)
select d.id, w.widget_type, w.title, coalesce(m.max_order, 0) + w.ord, true, '{}'::jsonb
from public.dashboards d
cross join (values ('top_services', 'Top Services', 1), ('engagement_pipeline', 'Engagement Pipeline', 2)) as w(widget_type, title, ord)
left join lateral (select max(display_order) as max_order from public.dashboard_widgets where dashboard_id = d.id) m on true
where not exists (
  select 1 from public.dashboard_widgets existing
  where existing.dashboard_id = d.id and existing.widget_type = w.widget_type
);
