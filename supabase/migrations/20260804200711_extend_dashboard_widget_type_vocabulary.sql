
alter table public.dashboard_widgets drop constraint dashboard_widgets_widget_type_check;
alter table public.dashboard_widgets add constraint dashboard_widgets_widget_type_check
  check (widget_type = any (array[
    'todays_work', 'missing_documents', 'review_queue', 'returns_due', 'signatures_pending',
    'messages', 'revenue', 'collections', 'kpis', 'staff_workload', 'client_health', 'compliance',
    'quick_actions', 'calendar', 'recent_activity'
  ]));
