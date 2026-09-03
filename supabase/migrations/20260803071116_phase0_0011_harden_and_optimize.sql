create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.current_workspace_ids() from public;
revoke execute on function public.is_platform_admin() from public;
revoke execute on function public.is_workspace_member(uuid) from public;
revoke execute on function public.is_workspace_admin(uuid) from public;
revoke execute on function public.has_permission(uuid, text) from public;
grant execute on function public.current_workspace_ids() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_admin(uuid) to authenticated;
grant execute on function public.has_permission(uuid, text) to authenticated;

revoke execute on function public.audit_trigger_fn() from public, authenticated;
revoke execute on function public.handle_new_auth_user() from public, authenticated;

revoke execute on function public.create_workspace(text, text, text) from public;
revoke execute on function public.get_my_workspaces() from public;
revoke execute on function public.invite_workspace_user(uuid, uuid, uuid) from public;
revoke execute on function public.accept_workspace_invitation(uuid) from public;
revoke execute on function public.revoke_workspace_user(uuid, uuid) from public;
revoke execute on function public.set_feature_flag(uuid, text, boolean, jsonb) from public;
grant execute on function public.create_workspace(text, text, text) to authenticated;
grant execute on function public.get_my_workspaces() to authenticated;
grant execute on function public.invite_workspace_user(uuid, uuid, uuid) to authenticated;
grant execute on function public.accept_workspace_invitation(uuid) to authenticated;
grant execute on function public.revoke_workspace_user(uuid, uuid) to authenticated;
grant execute on function public.set_feature_flag(uuid, text, boolean, jsonb) to authenticated;

drop policy if exists branding_assets_public_read on storage.objects;

create index if not exists activity_log_actor_idx on public.activity_log (actor_id);
create index if not exists system_settings_updated_by_idx on public.system_settings (updated_by);
create index if not exists workspace_feature_flags_updated_by_idx on public.workspace_feature_flags (updated_by);
create index if not exists workspace_users_invited_by_idx on public.workspace_users (invited_by);
create index if not exists workspaces_created_by_idx on public.workspaces (created_by);

drop policy if exists user_profiles_select on public.user_profiles;
create policy user_profiles_select on public.user_profiles
  for select using (
    id = (select auth.uid())
    or public.is_platform_admin()
    or exists (
      select 1 from public.workspace_users a
      join public.workspace_users b on b.workspace_id = a.workspace_id
      where a.user_id = (select auth.uid()) and a.status = 'active'
        and b.user_id = public.user_profiles.id and b.status = 'active'
    )
  );

drop policy if exists user_profiles_insert_self on public.user_profiles;
create policy user_profiles_insert_self on public.user_profiles
  for insert with check (id = (select auth.uid()));

drop policy if exists user_profiles_update_self on public.user_profiles;
create policy user_profiles_update_self on public.user_profiles
  for update using (id = (select auth.uid()));

drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions
  for select using ((select auth.role()) = 'authenticated');

drop policy if exists feature_flags_select on public.feature_flags;
create policy feature_flags_select on public.feature_flags
  for select using ((select auth.role()) = 'authenticated');

drop policy if exists workspace_users_update on public.workspace_users;
create policy workspace_users_update on public.workspace_users
  for update using (
    public.is_workspace_admin(workspace_id)
    or (user_id = (select auth.uid()) and status = 'invited')
  );

drop policy if exists activity_log_insert on public.activity_log;
create policy activity_log_insert on public.activity_log
  for insert with check (
    public.is_workspace_member(workspace_id) and actor_id = (select auth.uid())
  );

drop policy if exists notification_queue_select on public.notification_queue;
create policy notification_queue_select on public.notification_queue
  for select using (
    recipient_user_id = (select auth.uid())
    or (workspace_id is not null and public.is_workspace_admin(workspace_id))
  );

drop policy if exists office_locations_write on public.office_locations;
create policy office_locations_insert on public.office_locations
  for insert with check (public.is_workspace_admin(workspace_id));
create policy office_locations_update on public.office_locations
  for update using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy office_locations_delete on public.office_locations
  for delete using (public.is_workspace_admin(workspace_id));

drop policy if exists branding_write on public.branding;
create policy branding_insert on public.branding
  for insert with check (public.is_workspace_admin(workspace_id));
create policy branding_update on public.branding
  for update using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy branding_delete on public.branding
  for delete using (public.is_workspace_admin(workspace_id));

drop policy if exists system_settings_write on public.system_settings;
create policy system_settings_insert on public.system_settings
  for insert with check (public.is_workspace_admin(workspace_id));
create policy system_settings_update on public.system_settings
  for update using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy system_settings_delete on public.system_settings
  for delete using (public.is_workspace_admin(workspace_id));

drop policy if exists workspace_feature_flags_write on public.workspace_feature_flags;
create policy workspace_feature_flags_insert on public.workspace_feature_flags
  for insert with check (public.is_workspace_admin(workspace_id));
create policy workspace_feature_flags_update on public.workspace_feature_flags
  for update using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy workspace_feature_flags_delete on public.workspace_feature_flags
  for delete using (public.is_workspace_admin(workspace_id));
