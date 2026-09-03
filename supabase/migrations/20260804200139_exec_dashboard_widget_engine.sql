
alter table public.dashboard_widgets
  add column if not exists is_visible boolean not null default true;

create index if not exists idx_dashboard_widgets_dashboard on public.dashboard_widgets (dashboard_id);
create index if not exists idx_dashboards_workspace on public.dashboards (workspace_id);

-- Idempotently seeds the one workspace-wide default dashboard with the
-- Executive Dashboard's widget set. Safe to call on every dashboard load;
-- does nothing once it exists. role_slug stays null (applies to everyone
-- in the workspace) -- per-widget role/module/workspace-type visibility is
-- handled in config jsonb and filtered in the app, since dashboard_widgets
-- RLS ties row-level mutation to workspace admins, not individual users.
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
    values (p_workspace_id, 'Executive Dashboard', 'executive', true, 'active', auth.uid())
    returning id into v_dashboard_id;
  end if;

  select count(*) into v_widget_count from public.dashboard_widgets where dashboard_id = v_dashboard_id;

  if v_widget_count = 0 then
    insert into public.dashboard_widgets (dashboard_id, widget_type, title, display_order, config)
    values
      (v_dashboard_id, 'kpi_revenue', 'Revenue This Month', 1, '{}'::jsonb),
      (v_dashboard_id, 'kpi_open_engagements', 'Open Engagements', 2, '{}'::jsonb),
      (v_dashboard_id, 'kpi_tasks_due_today', 'Tasks Due Today', 3, '{}'::jsonb),
      (v_dashboard_id, 'kpi_outstanding_invoices', 'Outstanding Invoices', 4, '{}'::jsonb),
      (v_dashboard_id, 'kpi_missing_documents', 'Missing Documents', 5, '{}'::jsonb),
      (v_dashboard_id, 'kpi_open_messages', 'Open Client Messages', 6, '{}'::jsonb),
      (v_dashboard_id, 'priorities', 'Today''s Priorities', 7, '{}'::jsonb),
      (v_dashboard_id, 'quick_actions', 'Quick Actions', 8, '{}'::jsonb),
      (v_dashboard_id, 'calendar', 'Calendar', 9, '{}'::jsonb),
      (v_dashboard_id, 'recent_activity', 'Recent Activity', 10, '{}'::jsonb);
  end if;

  return v_dashboard_id;
end;
$$;

revoke execute on function public.ensure_default_dashboard(uuid) from public, anon;
