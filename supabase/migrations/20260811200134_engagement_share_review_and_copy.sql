-- Finishes the engagement_shares scaffold: a "Share with ERO" action that
-- creates a pending share with NO copy yet, temporary read-only RLS access
-- so the ERO can actually review the real original while it's pending or
-- under corrections, and a copy step that only runs once the ERO approves.
-- Attachments are handled separately in application code (this migration
-- only creates the metadata rows with a computed new storage_path -- the
-- physical file copy happens via the Storage API, which plain SQL can't
-- reach, since storage RLS keys off the workspace_id folder segment in the
-- path itself).

alter table public.clients add column source_workspace_id uuid references public.workspaces(id);
alter table public.engagements add column source_engagement_share_id uuid references public.engagement_shares(id);
create index clients_source_workspace_id_idx on public.clients (workspace_id, source_workspace_id);

-- Small reusable predicate: does an active, pending-or-under-review share
-- grant the caller's workspace temporary read access to this engagement?
create or replace function public.has_pending_engagement_share_access(p_engagement_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.engagement_shares es
    where es.engagement_id = p_engagement_id
      and es.status in ('pending', 'corrections_requested')
      and public.is_workspace_member(es.shared_with_workspace_id)
  );
$$;

drop policy if exists engagements_select on public.engagements;
create policy engagements_select on public.engagements
  for select using (
    public.has_permission(workspace_id, 'engagements.view')
    or public.has_pending_engagement_share_access(id)
  );

drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select using (
    public.is_workspace_member(workspace_id)
    or exists (
      select 1 from public.engagements e
      where e.client_id = clients.id and public.has_pending_engagement_share_access(e.id)
    )
  );

drop policy if exists engagement_tax_details_select on public.engagement_tax_details;
create policy engagement_tax_details_select on public.engagement_tax_details
  for select using (
    public.has_permission(workspace_id, 'engagements.view')
    or public.has_pending_engagement_share_access(engagement_id)
  );

drop policy if exists organizer_responses_select on public.organizer_responses;
create policy organizer_responses_select on public.organizer_responses
  for select using (
    public.has_permission(workspace_id, 'engagements.view')
    or public.is_portal_user(client_id)
    or public.has_pending_engagement_share_access(engagement_id)
  );

drop policy if exists organizer_response_answers_select on public.organizer_response_answers;
create policy organizer_response_answers_select on public.organizer_response_answers
  for select using (
    exists (
      select 1 from public.organizer_responses r
      where r.id = organizer_response_answers.organizer_response_id
        and (public.has_permission(r.workspace_id, 'engagements.view') or public.is_portal_user(r.client_id))
    )
    or exists (
      select 1 from public.organizer_responses r
      where r.id = organizer_response_answers.organizer_response_id
        and public.has_pending_engagement_share_access(r.engagement_id)
    )
  );

drop policy if exists client_documents_select on public.attachments;
create policy client_documents_select on public.attachments
  for select using (
    public.has_permission(workspace_id, 'documents.view')
    or (visibility = 'client_visible' and is_archived = false and public.is_portal_user_for_entity(entity_type, entity_id))
    or (
      visibility = 'client_visible' and is_archived = false and (
        (entity_type = 'engagement' and public.has_pending_engagement_share_access(entity_id))
        or (entity_type = 'client' and exists (
          select 1 from public.engagements e
          where e.client_id = attachments.entity_id and public.has_pending_engagement_share_access(e.id)
        ))
      )
    )
  );

-- "Share with ERO": creates the pending share, no copy yet.
create or replace function public.create_engagement_share(p_engagement_id uuid)
returns public.engagement_shares
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
  v_ero_workspace_id uuid;
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

  select parent_workspace_id into v_ero_workspace_id
  from public.firm_connections
  where child_workspace_id = v_workspace_id and relationship_type = 'ero_ptin' and status = 'active';

  if v_ero_workspace_id is null then
    raise exception 'This workspace is not connected to an ERO.';
  end if;

  insert into public.engagement_shares (engagement_id, workspace_id, shared_with_workspace_id, status, shared_by)
  values (p_engagement_id, v_workspace_id, v_ero_workspace_id, 'pending', auth.uid())
  returning * into v_row;

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

  return v_row;
end;
$$;

grant execute on function public.create_engagement_share(uuid) to authenticated;

-- PTIN calls this after fixing corrections, reusing the same share row (and
-- its full engagement_review_actions history) rather than creating a new one.
create or replace function public.resubmit_engagement_share(p_engagement_share_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.engagement_shares;
  v_recipient record;
begin
  select * into v_row from public.engagement_shares where id = p_engagement_share_id;
  if v_row.id is null then
    raise exception 'engagement share not found';
  end if;
  if not public.has_permission(v_row.workspace_id, 'engagements.share') then
    raise exception 'insufficient permissions to resubmit this engagement share';
  end if;
  if v_row.status <> 'corrections_requested' then
    raise exception 'only a share with corrections requested can be resubmitted';
  end if;

  update public.engagement_shares
  set status = 'pending', decision_notes = null, reviewed_by = null, reviewed_at = null, updated_at = now()
  where id = p_engagement_share_id;

  insert into public.engagement_review_actions (engagement_share_id, action, actor_id)
  values (p_engagement_share_id, 'resubmit', auth.uid());

  for v_recipient in
    select wu.user_id from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    where wu.workspace_id = v_row.shared_with_workspace_id and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  loop
    perform public.create_notification(
      v_row.shared_with_workspace_id, v_recipient.user_id, 'ENGAGEMENT_SHARE_RESUBMITTED',
      'engagement_share_resubmitted', jsonb_build_object('engagement_share_id', p_engagement_share_id),
      array['In-App'::text], 'Medium', 'engagement', v_row.engagement_id
    );
  end loop;
end;
$$;

grant execute on function public.resubmit_engagement_share(uuid) to authenticated;

-- Runs only after approval (called by the app, not automatically, so it
-- never fires on reject/withdraw). Clones client + engagement + tax details +
-- organizer responses/answers into the ERO's workspace. Attachment rows are
-- created with a computed new storage_path but the physical file is not
-- copied here -- returns the old/new path pairs for the caller to copy via
-- the Storage API.
create or replace function public.copy_shared_engagement(p_engagement_share_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_share public.engagement_shares;
  v_client_id uuid;
  v_new_client_id uuid := gen_random_uuid();
  v_new_engagement_id uuid := gen_random_uuid();
  v_row jsonb;
  v_tax_rec record;
  v_response_rec record;
  v_answer_rec record;
  v_attachment_rec record;
  v_new_response_id uuid;
  v_new_entity_id uuid;
  v_new_attachment_id uuid;
  v_new_storage_path text;
  v_paths jsonb := '[]'::jsonb;
begin
  select * into v_share from public.engagement_shares where id = p_engagement_share_id;
  if v_share.id is null then
    raise exception 'engagement share not found';
  end if;
  if not public.has_permission(v_share.shared_with_workspace_id, 'engagements.approve_review') then
    raise exception 'insufficient permissions to finalize this engagement share';
  end if;
  if v_share.status <> 'approved' then
    raise exception 'this share has not been approved';
  end if;

  select client_id into v_client_id from public.engagements where id = v_share.engagement_id;

  select to_jsonb(t) into v_row from public.clients t where t.id = v_client_id;
  v_row := (v_row - 'merged_into_client_id' - 'relationship_manager_id' - 'default_reviewer_id' - 'default_compliance_officer_id')
    || jsonb_build_object(
      'id', v_new_client_id, 'workspace_id', v_share.shared_with_workspace_id,
      'source_workspace_id', v_share.workspace_id, 'created_at', now(), 'updated_at', now()
    );
  insert into public.clients select * from jsonb_populate_record(null::public.clients, v_row);

  select to_jsonb(t) into v_row from public.engagements t where t.id = v_share.engagement_id;
  v_row := (v_row - 'reviewer_id' - 'assigned_staff_id' - 'compliance_officer_id')
    || jsonb_build_object(
      'id', v_new_engagement_id, 'workspace_id', v_share.shared_with_workspace_id,
      'client_id', v_new_client_id, 'status', 'Waiting On Review',
      'source_engagement_share_id', p_engagement_share_id, 'created_at', now(), 'updated_at', now()
    );
  insert into public.engagements select * from jsonb_populate_record(null::public.engagements, v_row);

  for v_tax_rec in select * from public.engagement_tax_details where engagement_id = v_share.engagement_id loop
    v_row := (to_jsonb(v_tax_rec) - 'original_engagement_id')
      || jsonb_build_object(
        'engagement_id', v_new_engagement_id, 'workspace_id', v_share.shared_with_workspace_id,
        'created_at', now(), 'updated_at', now()
      );
    insert into public.engagement_tax_details select * from jsonb_populate_record(null::public.engagement_tax_details, v_row);
  end loop;

  for v_response_rec in select * from public.organizer_responses where engagement_id = v_share.engagement_id loop
    v_new_response_id := gen_random_uuid();
    v_row := (to_jsonb(v_response_rec) - 'resolved_service_id')
      || jsonb_build_object(
        'id', v_new_response_id, 'engagement_id', v_new_engagement_id, 'client_id', v_new_client_id,
        'workspace_id', v_share.shared_with_workspace_id, 'created_at', now(), 'updated_at', now()
      );
    insert into public.organizer_responses select * from jsonb_populate_record(null::public.organizer_responses, v_row);

    for v_answer_rec in select * from public.organizer_response_answers where organizer_response_id = v_response_rec.id loop
      v_row := to_jsonb(v_answer_rec)
        || jsonb_build_object('id', gen_random_uuid(), 'organizer_response_id', v_new_response_id, 'updated_at', now());
      insert into public.organizer_response_answers select * from jsonb_populate_record(null::public.organizer_response_answers, v_row);
    end loop;
  end loop;

  for v_attachment_rec in
    select * from public.attachments
    where visibility = 'client_visible' and is_archived = false
      and (
        (entity_type = 'engagement' and entity_id = v_share.engagement_id)
        or (entity_type = 'client' and entity_id = v_client_id)
      )
  loop
    v_new_attachment_id := gen_random_uuid();
    v_new_entity_id := case when v_attachment_rec.entity_type = 'engagement' then v_new_engagement_id else v_new_client_id end;
    v_new_storage_path := v_share.shared_with_workspace_id || '/' || v_new_entity_id || '/' || extract(epoch from now())::bigint || '-' || v_attachment_rec.file_name;

    v_row := (to_jsonb(v_attachment_rec) - 'replaces_attachment_id')
      || jsonb_build_object(
        'id', v_new_attachment_id, 'workspace_id', v_share.shared_with_workspace_id,
        'entity_id', v_new_entity_id, 'storage_path', v_new_storage_path, 'created_at', now()
      );
    insert into public.attachments select * from jsonb_populate_record(null::public.attachments, v_row);

    v_paths := v_paths || jsonb_build_object('old_path', v_attachment_rec.storage_path, 'new_path', v_new_storage_path);
  end loop;

  return v_paths;
end;
$$;

grant execute on function public.copy_shared_engagement(uuid) to authenticated;
