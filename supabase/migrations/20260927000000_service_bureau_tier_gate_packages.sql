-- Packages (a sellable software+banking bundle) are a Service Bureau-only
-- concept -- an ERO or multi-office firm still manages connected PTINs, but
-- never resells software/banking as a priced product. Today's page-level
-- redirect (isEroManagementTier) is the only thing stopping an ERO admin
-- from writing a firm_packages row directly; RLS itself never restricted by
-- workspace_type. This closes that gap with one SECURITY DEFINER helper
-- (the idiomatic place for workspace_type-based logic, matching the
-- existing can_use_network_messaging precedent) called from each write
-- policy, additive to the existing is_workspace_admin() check.

create or replace function public.is_service_bureau_workspace(p_workspace_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce((select w.workspace_type from public.workspaces w where w.id = p_workspace_id) = 'service_bureau', false);
$function$;

drop policy if exists firm_packages_write on public.firm_packages;
drop policy if exists firm_packages_update on public.firm_packages;
drop policy if exists firm_packages_delete on public.firm_packages;

create policy firm_packages_write on public.firm_packages for insert with check (
  public.is_workspace_admin(workspace_id) and public.is_service_bureau_workspace(workspace_id)
);
create policy firm_packages_update on public.firm_packages for update using (
  public.is_workspace_admin(workspace_id) and public.is_service_bureau_workspace(workspace_id)
) with check (
  public.is_workspace_admin(workspace_id) and public.is_service_bureau_workspace(workspace_id)
);
create policy firm_packages_delete on public.firm_packages for delete using (
  public.is_workspace_admin(workspace_id) and public.is_service_bureau_workspace(workspace_id)
);

drop policy if exists firm_package_option_groups_insert on public.firm_package_option_groups;
drop policy if exists firm_package_option_groups_update on public.firm_package_option_groups;
drop policy if exists firm_package_option_groups_delete on public.firm_package_option_groups;

create policy firm_package_option_groups_insert on public.firm_package_option_groups for insert with check (
  exists (
    select 1 from public.firm_packages p
    where p.id = package_id and public.is_workspace_admin(p.workspace_id) and public.is_service_bureau_workspace(p.workspace_id)
  )
);
create policy firm_package_option_groups_update on public.firm_package_option_groups for update using (
  exists (
    select 1 from public.firm_packages p
    where p.id = firm_package_option_groups.package_id and public.is_workspace_admin(p.workspace_id) and public.is_service_bureau_workspace(p.workspace_id)
  )
);
create policy firm_package_option_groups_delete on public.firm_package_option_groups for delete using (
  exists (
    select 1 from public.firm_packages p
    where p.id = firm_package_option_groups.package_id and public.is_workspace_admin(p.workspace_id) and public.is_service_bureau_workspace(p.workspace_id)
  )
);

drop policy if exists firm_package_options_insert on public.firm_package_options;
drop policy if exists firm_package_options_update on public.firm_package_options;
drop policy if exists firm_package_options_delete on public.firm_package_options;

create policy firm_package_options_insert on public.firm_package_options for insert with check (
  exists (
    select 1 from public.firm_package_option_groups g join public.firm_packages p on p.id = g.package_id
    where g.id = option_group_id and public.is_workspace_admin(p.workspace_id) and public.is_service_bureau_workspace(p.workspace_id)
  )
);
create policy firm_package_options_update on public.firm_package_options for update using (
  exists (
    select 1 from public.firm_package_option_groups g join public.firm_packages p on p.id = g.package_id
    where g.id = firm_package_options.option_group_id and public.is_workspace_admin(p.workspace_id) and public.is_service_bureau_workspace(p.workspace_id)
  )
);
create policy firm_package_options_delete on public.firm_package_options for delete using (
  exists (
    select 1 from public.firm_package_option_groups g join public.firm_packages p on p.id = g.package_id
    where g.id = firm_package_options.option_group_id and public.is_workspace_admin(p.workspace_id) and public.is_service_bureau_workspace(p.workspace_id)
  )
);
