
-- Per-user dashboard personalization overlay: dashboard_widgets stays the
-- shared, role-scoped base layout (admin-managed); this table holds each
-- user's personal hide/show + reorder overrides on top of it, so no
-- duplicate per-user copies of dashboards/dashboard_widgets are needed.
create table public.user_widget_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dashboard_widget_id uuid not null references public.dashboard_widgets(id) on delete cascade,
  is_visible boolean,
  display_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dashboard_widget_id)
);

create index user_widget_preferences_user_idx on public.user_widget_preferences (user_id);

create trigger user_widget_preferences_set_updated_at
  before update on public.user_widget_preferences
  for each row execute function public.set_updated_at();

alter table public.user_widget_preferences enable row level security;

create policy user_widget_preferences_select on public.user_widget_preferences
  for select using (user_id = auth.uid());

create policy user_widget_preferences_insert on public.user_widget_preferences
  for insert with check (user_id = auth.uid());

create policy user_widget_preferences_update on public.user_widget_preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy user_widget_preferences_delete on public.user_widget_preferences
  for delete using (user_id = auth.uid());
