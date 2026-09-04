-- ERO/PTIN sharing: reviewer assignment, an automation hook for incoming
-- shares, and a connection-level control over whether the originating PTIN
-- can still reassign staff on an engagement while it's under ERO review.
--
-- The sharing system itself (firm_connections, engagement_shares,
-- create_engagement_share/respond_to_engagement_share/etc, the Review Queue
-- UI) already exists and works -- this only adds the pieces that were
-- still missing: routing a new share to a specific reviewer instead of
-- every admin, letting an ERO build their own notification/routing
-- automation on top of that, and letting an ERO restrict PTIN-side staff
-- reassignment while their filing is under review.

alter table public.firm_connections
  add column if not exists default_reviewer_id uuid references auth.users(id) on delete set null,
  add column if not exists restrict_ptin_staff_assignment boolean not null default false;

alter table public.engagement_shares
  add column if not exists reviewer_id uuid references auth.users(id) on delete set null;

-- Assigns the connection's default reviewer (if one is set) at share
-- creation, and notifies that reviewer specifically instead of every
-- owner/admin -- falling back to the old "every admin" behavior when no
-- default reviewer is configured, so this stays safe with zero setup.
create or replace function public.create_engagement_share(p_engagement_id uuid)
returns public.engagement_shares
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_ero_workspace_id uuid;
  v_reviewer_id uuid;
  v_row public.engagement_shares;
  v_recipient record;
begin
  select workspace_id into v_workspace_id from public.engagements where id = p_engagement_id;
  if v_workspace_id is null then
    raise exception 'engagement not found';
  end if;
  if not public.has_permission(v_workspace_id, 'engagements.share') then
    raise exception 'insufficient permissions to share this engagement';
  end if;

  select parent_workspace_id, default_reviewer_id into v_ero_workspace_id, v_reviewer_id
  from public.firm_connections
  where child_workspace_id = v_workspace_id and relationship_type = 'ero_ptin' and status = 'active';

  if v_ero_workspace_id is null then
    raise exception 'This workspace is not connected to an ERO.';
  end if;

  insert into public.engagement_shares (engagement_id, workspace_id, shared_with_workspace_id, status, shared_by, reviewer_id)
  values (p_engagement_id, v_workspace_id, v_ero_workspace_id, 'pending', auth.uid(), v_reviewer_id)
  returning * into v_row;

  if v_reviewer_id is not null then
    perform public.create_notification(
      v_ero_workspace_id, v_reviewer_id, 'ENGAGEMENT_SHARE_CREATED',
      'engagement_share_created', jsonb_build_object('engagement_share_id', v_row.id, 'engagement_id', p_engagement_id),
      array['In-App'::text], 'Medium', 'engagement', p_engagement_id
    );
  else
    for v_recipient in
      select wu.user_id from public.workspace_users wu
      join public.roles r on r.id = wu.role_id
      where wu.workspace_id = v_ero_workspace_id and wu.status = 'active'
        and (wu.is_owner or r.slug in ('owner', 'admin'))
    loop
      perform public.create_notification(
        v_ero_workspace_id, v_recipient.user_id, 'ENGAGEMENT_SHARE_CREATED',
        'engagement_share_created', jsonb_build_object('engagement_share_id', v_row.id, 'engagement_id', p_engagement_id),
        array['In-App'::text], 'Medium', 'engagement', p_engagement_id
      );
    end loop;
  end if;

  return v_row;
end;
$function$;

-- Lets an ERO build their own routing on top of the baseline notification
-- above (e.g. round-robin to a review team via multiple send_notification
-- steps, or ping Slack via webhook). Deliberately leaves engagement_id and
-- client_id null on the automation_runs row: the engagement belongs to the
-- PTIN's workspace, not the ERO's, and every action in
-- execute_automation_step that touches an engagement/client assumes it
-- belongs to the run's own workspace_id. Carrying the cross-workspace
-- engagement id there would let an ERO's automation write
-- tasks/notes/assignments against a record it doesn't own. The engagement
-- number and originating firm name are passed via trigger_snapshot instead,
-- for steps that read it directly (same pattern as send_email's
-- organizer_link lookup) rather than through the generic merge-field
-- context, so nothing here needs the usual engagement/client lookup.
create or replace function public.fire_engagement_share_created_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_shared_by_name text;
  v_engagement_number text;
begin
  select coalesce(w.name, 'A connected PTIN') into v_shared_by_name from public.workspaces w where w.id = new.workspace_id;
  select engagement_number into v_engagement_number from public.engagements where id = new.engagement_id;

  v_context := jsonb_build_object(
    'engagement_share_id', new.id,
    'engagement_id', new.engagement_id,
    'engagement_number', v_engagement_number,
    'shared_by_workspace_name', v_shared_by_name,
    'reviewer_id', new.reviewer_id
  );

  for v_automation in
    select * from public.automations
    where workspace_id = new.shared_with_workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'engagement_share.created'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.shared_with_workspace_id, null, null) then
      insert into public.automation_runs (workspace_id, automation_id, trigger_snapshot, status)
      values (new.shared_with_workspace_id, v_automation.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

drop trigger if exists trg_fire_engagement_share_created_automations on public.engagement_shares;
create trigger trg_fire_engagement_share_created_automations
after insert on public.engagement_shares
for each row execute function public.fire_engagement_share_created_automations();

-- The ERO-side restriction: while a share is open (pending or sent back for
-- corrections), and the connection has restrict_ptin_staff_assignment on,
-- only someone on the ERO's side can change who's assigned. Enforced as a
-- trigger rather than in one RPC because engagements.assigned_staff_id is
-- updated from several different places (AssignmentForm, bulk assignment,
-- the assign_user automation action) with no single choke point otherwise.
create or replace function public.enforce_ero_staff_assignment_restriction()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ero_workspace_id uuid;
begin
  if new.assigned_staff_id is not distinct from old.assigned_staff_id then
    return new;
  end if;

  select fc.parent_workspace_id into v_ero_workspace_id
  from public.firm_connections fc
  join public.engagement_shares es on es.workspace_id = fc.child_workspace_id and es.shared_with_workspace_id = fc.parent_workspace_id
  where fc.child_workspace_id = old.workspace_id
    and fc.relationship_type = 'ero_ptin'
    and fc.status = 'active'
    and fc.restrict_ptin_staff_assignment = true
    and es.engagement_id = old.id
    and es.status in ('pending', 'corrections_requested')
  limit 1;

  if v_ero_workspace_id is not null and not public.is_workspace_member(v_ero_workspace_id) then
    raise exception 'This engagement is under ERO review -- only the reviewing firm can reassign it until the review is resolved.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enforce_ero_staff_assignment_restriction on public.engagements;
create trigger trg_enforce_ero_staff_assignment_restriction
before update of assigned_staff_id on public.engagements
for each row execute function public.enforce_ero_staff_assignment_restriction();

-- Surface the two new connection settings to the ERO's own Connections UI.
-- Adding columns to a table-returning function's result set changes its
-- row type, which create-or-replace can't do in place -- has to be dropped
-- first.
drop function if exists public.get_ero_connected_partners(uuid, text[]);
create function public.get_ero_connected_partners(p_workspace_id uuid, p_relationship_types text[] default array['ero_ptin'::text])
returns table(
  connection_id uuid, child_workspace_id uuid, name text, relationship_type text, status text,
  phone text, primary_contact_email text, website text, mailing_address text,
  billing_responsibility text, shares_communications_identity boolean, allows_branding_override boolean,
  default_reviewer_id uuid, restrict_ptin_staff_assignment boolean,
  notes text, created_at timestamptz, responded_at timestamptz
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
      fc.default_reviewer_id, fc.restrict_ptin_staff_assignment,
      fc.notes, fc.created_at, fc.responded_at
    from public.firm_connections fc
    left join public.workspaces cw on cw.id = fc.child_workspace_id
    where fc.parent_workspace_id = p_workspace_id
      and fc.relationship_type = any(p_relationship_types)
    order by (fc.status = 'active') desc, cw.name nulls last;
end;
$function$;
