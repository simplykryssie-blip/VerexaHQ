-- Keep RLS helper functions callable by signed-in staff and include workspace owners.

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.owner_id = auth.uid()
  ) or exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and lower(coalesce(wm.member_status, 'active')) in ('active', 'accepted')
  );
$$;

create or replace function public.user_has_workspace_access(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_workspace_member(p_workspace_id);
$$;

create or replace function public.workspace_has_any_role(
  p_workspace_id uuid,
  p_roles text[],
  p_user_id uuid default auth.uid()
)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
  or exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.owner_id = p_user_id
  )
  or exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_user_id
      and lower(coalesce(wm.member_status, 'active')) in ('active', 'accepted')
      and lower(coalesce(wm.role, '')) = any (
        select lower(role_name) from unnest(p_roles) as role_name
      )
  );
$$;

create or replace function public.workspace_member_permission(
  p_workspace_id uuid,
  p_permission text,
  p_user_id uuid default auth.uid()
)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.owner_id = p_user_id
  )
  or coalesce((
    select (wm.permissions ->> p_permission)::boolean
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_user_id
      and lower(coalesce(wm.member_status, 'active')) in ('active', 'accepted')
    order by wm.created_at
    limit 1
  ), false);
$$;

create or replace function public.workspace_can_prepare_tax(
  p_workspace_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
    or public.workspace_has_any_role(
      p_workspace_id,
      array['Owner','Administrator','Admin','ERO','Senior Preparer','Preparer','Tax Preparer'],
      p_user_id
    )
    or public.workspace_member_permission(p_workspace_id, 'prepare_tax_returns', p_user_id);
$$;

create or replace function public.workspace_can_review_tax(
  p_workspace_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
    or public.workspace_has_any_role(
      p_workspace_id,
      array['Owner','Administrator','Admin','ERO','Reviewer','Senior Reviewer','Tax Reviewer'],
      p_user_id
    )
    or public.workspace_member_permission(p_workspace_id, 'review_tax_returns', p_user_id);
$$;

create or replace function public.can_staff_write(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.workspace_allows_business_writes(p_workspace_id)
  and (
    exists (
      select 1 from public.workspaces w
      where w.id = p_workspace_id and w.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = p_workspace_id
        and wm.user_id = auth.uid()
        and lower(coalesce(wm.member_status, 'active')) in ('active', 'accepted')
        and lower(coalesce(wm.role, '')) in (
          'owner','administrator','admin','manager','staff','preparer',
          'senior preparer','tax preparer','reviewer','senior reviewer',
          'tax reviewer','ero','bookkeeper','payroll'
        )
    )
    or public.is_platform_admin()
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.user_has_workspace_access(uuid) from public;
revoke all on function public.workspace_has_any_role(uuid, text[], uuid) from public;
revoke all on function public.workspace_member_permission(uuid, text, uuid) from public;
revoke all on function public.workspace_can_prepare_tax(uuid, uuid) from public;
revoke all on function public.workspace_can_review_tax(uuid, uuid) from public;
revoke all on function public.can_staff_write(uuid) from public;

grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function public.user_has_workspace_access(uuid) to authenticated, service_role;
grant execute on function public.workspace_has_any_role(uuid, text[], uuid) to authenticated, service_role;
grant execute on function public.workspace_member_permission(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.workspace_can_prepare_tax(uuid, uuid) to authenticated, service_role;
grant execute on function public.workspace_can_review_tax(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_staff_write(uuid) to authenticated, service_role;

