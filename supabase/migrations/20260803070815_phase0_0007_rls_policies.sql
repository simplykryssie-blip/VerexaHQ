alter table public.workspaces enable row level security;
alter table public.user_profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.workspace_users enable row level security;
alter table public.office_locations enable row level security;
alter table public.branding enable row level security;
alter table public.system_settings enable row level security;
alter table public.feature_flags enable row level security;
alter table public.workspace_feature_flags enable row level security;
alter table public.audit_log enable row level security;
alter table public.activity_log enable row level security;
alter table public.notification_queue enable row level security;

create policy workspaces_select on public.workspaces
  for select using (public.is_workspace_member(id));

create policy workspaces_insert on public.workspaces
  for insert with check (public.is_platform_admin());

create policy workspaces_update on public.workspaces
  for update using (public.is_workspace_admin(id));

create policy workspaces_delete on public.workspaces
  for delete using (public.is_platform_admin());

create policy user_profiles_select on public.user_profiles
  for select using (
    id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1 from public.workspace_users a
      join public.workspace_users b on b.workspace_id = a.workspace_id
      where a.user_id = auth.uid() and a.status = 'active'
        and b.user_id = public.user_profiles.id and b.status = 'active'
    )
  );

create policy user_profiles_insert_self on public.user_profiles
  for insert with check (id = auth.uid());

create policy user_profiles_update_self on public.user_profiles
  for update using (id = auth.uid());

create policy permissions_select on public.permissions
  for select using (auth.role() = 'authenticated');

create policy roles_select on public.roles
  for select using (
    workspace_id is null
    or public.is_workspace_member(workspace_id)
  );

create policy roles_insert on public.roles
  for insert with check (
    workspace_id is not null and public.is_workspace_admin(workspace_id)
  );

create policy roles_update on public.roles
  for update using (
    workspace_id is not null and public.is_workspace_admin(workspace_id)
  );

create policy roles_delete on public.roles
  for delete using (
    workspace_id is not null and public.is_workspace_admin(workspace_id)
  );

create policy role_permissions_select on public.role_permissions
  for select using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and (r.workspace_id is null or public.is_workspace_member(r.workspace_id))
    )
  );

create policy role_permissions_insert on public.role_permissions
  for insert with check (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and r.workspace_id is not null
        and public.is_workspace_admin(r.workspace_id)
    )
  );

create policy role_permissions_delete on public.role_permissions
  for delete using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and r.workspace_id is not null
        and public.is_workspace_admin(r.workspace_id)
    )
  );

create policy workspace_users_select on public.workspace_users
  for select using (public.is_workspace_member(workspace_id));

create policy workspace_users_insert on public.workspace_users
  for insert with check (public.is_workspace_admin(workspace_id));

create policy workspace_users_update on public.workspace_users
  for update using (
    public.is_workspace_admin(workspace_id)
    or (user_id = auth.uid() and status = 'invited')
  );

create policy workspace_users_delete on public.workspace_users
  for delete using (public.is_workspace_admin(workspace_id));

create policy office_locations_select on public.office_locations
  for select using (public.is_workspace_member(workspace_id));
create policy office_locations_write on public.office_locations
  for all using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy branding_select on public.branding
  for select using (public.is_workspace_member(workspace_id));
create policy branding_write on public.branding
  for all using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy system_settings_select on public.system_settings
  for select using (public.is_workspace_member(workspace_id));
create policy system_settings_write on public.system_settings
  for all using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy workspace_feature_flags_select on public.workspace_feature_flags
  for select using (public.is_workspace_member(workspace_id));
create policy workspace_feature_flags_write on public.workspace_feature_flags
  for all using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy feature_flags_select on public.feature_flags
  for select using (auth.role() = 'authenticated');

create policy audit_log_select on public.audit_log
  for select using (
    (workspace_id is not null and public.is_workspace_admin(workspace_id))
    or public.is_platform_admin()
  );

create policy activity_log_select on public.activity_log
  for select using (public.is_workspace_member(workspace_id));

create policy activity_log_insert on public.activity_log
  for insert with check (
    public.is_workspace_member(workspace_id) and actor_id = auth.uid()
  );

create policy notification_queue_select on public.notification_queue
  for select using (
    recipient_user_id = auth.uid()
    or (workspace_id is not null and public.is_workspace_admin(workspace_id))
  );

create policy notification_queue_insert on public.notification_queue
  for insert with check (
    workspace_id is not null and public.is_workspace_admin(workspace_id)
  );
