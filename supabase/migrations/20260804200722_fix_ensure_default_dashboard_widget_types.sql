
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
      (v_dashboard_id, 'recent_activity', 'Recent Activity', 10, '{}'::jsonb);
  end if;

  return v_dashboard_id;
end;
$$;
