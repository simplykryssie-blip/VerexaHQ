-- Learning Hub access currently only reaches an owner's *direct*
-- firm_connections children (matches this codebase's no-recursion
-- convention -- see get_ero_return_status and siblings). This adds exactly
-- one more hop: when a Service Bureau shares its content with an ERO, the
-- SB can now choose (per-connection, default off) whether that ERO's own
-- connected PTINs also get access -- an Independent PTIN with no
-- connection at all, or one connected only to an ERO that hasn't been
-- granted this, still sees nothing.
alter table public.firm_connections
  add column allows_learning_hub_downline_share boolean not null default false;

-- Single source of truth for "which workspaces can see p_owner_workspace_id's
-- Learning Hub content": the owner itself, every active direct child, and
-- -- only when the owner has turned the flag on for that specific SB->ERO
-- connection -- every PTIN actively connected to that ERO. Shared by both
-- has_learning_hub_access (checked against the caller) and
-- assign_learning_course (checked against the assignee) so the two can't
-- drift apart the way they had before.
create or replace function public.learning_hub_reachable_workspaces(p_owner_workspace_id uuid)
returns table(workspace_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p_owner_workspace_id
  union
  select fc.child_workspace_id
  from public.firm_connections fc
  where fc.parent_workspace_id = p_owner_workspace_id
    and fc.status = 'active'
    and fc.child_workspace_id is not null
  union
  select ero_ptin.child_workspace_id
  from public.firm_connections sb_ero
  join public.firm_connections ero_ptin
    on ero_ptin.parent_workspace_id = sb_ero.child_workspace_id
   and ero_ptin.relationship_type = 'ero_ptin'
   and ero_ptin.status = 'active'
  where sb_ero.parent_workspace_id = p_owner_workspace_id
    and sb_ero.relationship_type = 'service_bureau_ero'
    and sb_ero.status = 'active'
    and sb_ero.allows_learning_hub_downline_share = true;
$function$;

grant execute on function public.learning_hub_reachable_workspaces(uuid) to authenticated;

create or replace function public.has_learning_hub_access(p_owner_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.learning_hub_reachable_workspaces(p_owner_workspace_id) w
    where public.is_workspace_member(w.workspace_id)
  );
$function$;

create or replace function public.assign_learning_course(p_course_id uuid, p_user_id uuid, p_due_date date default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner_workspace_id uuid;
  v_assignee_workspace_id uuid;
begin
  select owner_workspace_id into v_owner_workspace_id from public.learning_courses where id = p_course_id;
  if v_owner_workspace_id is null then
    raise exception 'course not found';
  end if;
  if not public.has_permission(v_owner_workspace_id, 'learning_hub.manage') then
    raise exception 'insufficient permissions to assign this course';
  end if;

  select workspace_id into v_assignee_workspace_id
  from public.workspace_users
  where user_id = p_user_id and status = 'active'
  order by created_at asc
  limit 1;

  if v_assignee_workspace_id is null or not exists (
    select 1 from public.learning_hub_reachable_workspaces(v_owner_workspace_id) w
    where w.workspace_id = v_assignee_workspace_id
  ) then
    raise exception 'that person does not have access to this course';
  end if;

  insert into public.learning_course_assignments (course_id, user_id, workspace_id, assigned_by, due_date)
  values (p_course_id, p_user_id, v_assignee_workspace_id, auth.uid(), p_due_date)
  on conflict (course_id, user_id) do update set due_date = excluded.due_date;
end;
$function$;

-- Surface the new toggle through the same connections-directory RPC the
-- Settings > Users & Staff page already reads every other per-connection
-- flag from. The return table is gaining a column, so the old signature
-- has to be dropped first (Postgres won't CREATE OR REPLACE over a changed
-- RETURNS TABLE shape).
drop function if exists public.get_ero_connected_partners(uuid, text[]);

create function public.get_ero_connected_partners(p_workspace_id uuid, p_relationship_types text[] default array['ero_ptin'])
returns table(
  connection_id uuid, child_workspace_id uuid, name text, relationship_type text, status text,
  phone text, primary_contact_email text, website text, mailing_address text,
  billing_responsibility text, shares_communications_identity boolean, allows_branding_override boolean,
  default_reviewer_id uuid, restrict_ptin_staff_assignment boolean, allows_learning_hub_downline_share boolean,
  package_id uuid, notes text, created_at timestamptz, responded_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only a workspace admin can view connected partners';
  end if;

  return query
    select
      fc.id, fc.child_workspace_id, coalesce(cw.name, 'Pending invite'), fc.relationship_type, fc.status,
      cw.phone, cw.primary_contact_email::text, cw.website, cw.mailing_address,
      fc.billing_responsibility, fc.shares_communications_identity, fc.allows_branding_override,
      fc.default_reviewer_id, fc.restrict_ptin_staff_assignment, fc.allows_learning_hub_downline_share, fc.package_id,
      fc.notes, fc.created_at, fc.responded_at
    from public.firm_connections fc
    left join public.workspaces cw on cw.id = fc.child_workspace_id
    where fc.parent_workspace_id = p_workspace_id
      and fc.relationship_type = any(p_relationship_types)
    order by (fc.status = 'active') desc, cw.name nulls last;
end;
$function$;
