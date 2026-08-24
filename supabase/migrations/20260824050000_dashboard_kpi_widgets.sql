-- New main-dashboard tiles: active customers, upcoming account renewals,
-- and payment failures (open/closed). Widget types are gated by a CHECK
-- constraint, and ensure_default_dashboard() only seeds its widget list
-- once per dashboard (skipped entirely once any row exists), so existing
-- dashboards need an explicit backfill alongside the new seed defaults.
alter table public.dashboard_widgets drop constraint dashboard_widgets_widget_type_check;
alter table public.dashboard_widgets add constraint dashboard_widgets_widget_type_check
  check (widget_type = any (array[
    'todays_work','missing_documents','review_queue','returns_due','signatures_pending',
    'messages','revenue','collections','kpis','staff_workload','client_health','compliance',
    'quick_actions','calendar','recent_activity',
    'active_customers','upcoming_renewals','payment_failures'
  ]));

create or replace function public.ensure_default_dashboard(p_workspace_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      (v_dashboard_id, 'active_customers', 'Active Customers', 1, '{}'::jsonb),
      (v_dashboard_id, 'revenue', 'Revenue', 2, '{}'::jsonb),
      (v_dashboard_id, 'upcoming_renewals', 'Upcoming Renewals', 3, '{}'::jsonb),
      (v_dashboard_id, 'payment_failures', 'Payment Failures', 4, '{}'::jsonb),
      (v_dashboard_id, 'kpis', 'Engagements & Tasks', 5, '{}'::jsonb),
      (v_dashboard_id, 'collections', 'Outstanding Invoices', 6, '{}'::jsonb),
      (v_dashboard_id, 'missing_documents', 'Missing Documents', 7, '{}'::jsonb),
      (v_dashboard_id, 'messages', 'Open Client Messages', 8, '{}'::jsonb),
      (v_dashboard_id, 'todays_work', 'Today''s Priorities', 9, '{}'::jsonb),
      (v_dashboard_id, 'review_queue', 'Review Queue', 10, '{}'::jsonb),
      (v_dashboard_id, 'quick_actions', 'Quick Actions', 11, '{}'::jsonb),
      (v_dashboard_id, 'calendar', 'Calendar', 12, '{}'::jsonb),
      (v_dashboard_id, 'recent_activity', 'Recent Activity', 13, '{}'::jsonb);
  end if;

  return v_dashboard_id;
end;
$function$;

revoke all on function public.ensure_default_dashboard(uuid) from public, anon, authenticated;
grant execute on function public.ensure_default_dashboard(uuid) to authenticated, service_role;

-- Backfill the 3 new tiles onto every dashboard that predates them, right
-- after display_order 0 (so they lead the board on existing workspaces too).
do $$
declare
  v_dash record;
  v_base int;
begin
  for v_dash in select id from public.dashboards loop
    if not exists (select 1 from public.dashboard_widgets where dashboard_id = v_dash.id and widget_type = 'active_customers') then
      select coalesce(min(display_order), 1) into v_base from public.dashboard_widgets where dashboard_id = v_dash.id;
      update public.dashboard_widgets set display_order = display_order + 3 where dashboard_id = v_dash.id;
      insert into public.dashboard_widgets (dashboard_id, widget_type, title, display_order, config)
      values
        (v_dash.id, 'active_customers', 'Active Customers', v_base, '{}'::jsonb),
        (v_dash.id, 'upcoming_renewals', 'Upcoming Renewals', v_base + 1, '{}'::jsonb),
        (v_dash.id, 'payment_failures', 'Payment Failures', v_base + 2, '{}'::jsonb);
    end if;
  end loop;
end $$;
