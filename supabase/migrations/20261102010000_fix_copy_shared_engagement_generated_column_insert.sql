-- Isolated bug fix, NOT part of Phase 3.2's capability gate.
--
-- copy_shared_engagement has always used `insert into public.<table>
-- select * from jsonb_populate_record(null::public.<table>, v_row)` to copy
-- clients/engagements/attachments rows into the receiving workspace. This
-- pattern supplies a positional value for EVERY column of the target
-- table's composite type, including `search_vector`, which is a
-- `GENERATED ALWAYS ... STORED` column on all three tables. Postgres
-- rejects any explicit value (even one derived from `SELECT *`) for a
-- stored generated column: ERROR 428C9 "cannot insert a non-DEFAULT value
-- into column \"search_vector\"".
--
-- This predates Phase 3.2 entirely -- the identical INSERT statements are
-- byte-for-byte present in production's currently-live copy_shared_engagement
-- (created in 20260811200134_engagement_share_review_and_copy.sql) and in
-- the baseline schema snapshot. The success path of this function has
-- never been able to complete, in production, for any workspace. Phase
-- 3.2's capability check runs earlier in the function and does not touch
-- these INSERT statements; this fix does not touch the capability check.
--
-- Confirmed via a full-codebase grep that no other function uses this
-- `select * from jsonb_populate_record` pattern against clients,
-- engagements, attachments, or notes (the only four tables with a
-- GENERATED ALWAYS search_vector column) -- this defect is isolated to
-- copy_shared_engagement's three affected INSERTs.
--
-- Fix: name the target columns explicitly (every column of each table
-- except search_vector), so the generated column is never assigned a
-- value and Postgres computes it itself, as designed. No other behavior
-- changes: same source data, same destination workspace, same column
-- values for every other column.
CREATE OR REPLACE FUNCTION public.copy_shared_engagement(p_engagement_share_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if not public.is_workspace_operational(v_share.shared_with_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if v_share.status <> 'approved' then
    raise exception 'this share has not been approved';
  end if;
  if not public.can_operate_client_book(v_share.shared_with_workspace_id) then
    raise exception 'this workspace is not enabled to operate a client/engagement book';
  end if;

  select client_id into v_client_id from public.engagements where id = v_share.engagement_id;

  select to_jsonb(t) into v_row from public.clients t where t.id = v_client_id;
  v_row := (v_row - 'merged_into_client_id' - 'relationship_manager_id' - 'default_reviewer_id' - 'default_compliance_officer_id')
    || jsonb_build_object(
      'id', v_new_client_id, 'workspace_id', v_share.shared_with_workspace_id,
      'source_workspace_id', v_share.workspace_id, 'created_at', now(), 'updated_at', now()
    );
  insert into public.clients (
    id, workspace_id, client_type, lifecycle_status, first_name, last_name, business_name, date_of_birth,
    primary_email, primary_phone, address_line1, address_line2, city, state, postal_code, country,
    ssn_encrypted, ssn_last4, ssn_hash, ein_encrypted, ein_last4, ein_hash, itin_encrypted, itin_last4, itin_hash,
    normalized_email, normalized_phone, has_portal_access, tags, custom_fields, notes, merged_into_client_id,
    created_by, created_at, updated_at, relationship_manager_id, default_reviewer_id, default_compliance_officer_id,
    client_number, source_workspace_id, portal_basic_info_completed_at, middle_name, suffix, lost_reason,
    sms_opt_out, sms_opt_out_at, email_opt_out, email_opt_out_at, lost_at
  )
  select
    id, workspace_id, client_type, lifecycle_status, first_name, last_name, business_name, date_of_birth,
    primary_email, primary_phone, address_line1, address_line2, city, state, postal_code, country,
    ssn_encrypted, ssn_last4, ssn_hash, ein_encrypted, ein_last4, ein_hash, itin_encrypted, itin_last4, itin_hash,
    normalized_email, normalized_phone, has_portal_access, tags, custom_fields, notes, merged_into_client_id,
    created_by, created_at, updated_at, relationship_manager_id, default_reviewer_id, default_compliance_officer_id,
    client_number, source_workspace_id, portal_basic_info_completed_at, middle_name, suffix, lost_reason,
    sms_opt_out, sms_opt_out_at, email_opt_out, email_opt_out_at, lost_at
  from jsonb_populate_record(null::public.clients, v_row);

  select to_jsonb(t) into v_row from public.engagements t where t.id = v_share.engagement_id;
  v_row := (v_row - 'reviewer_id' - 'assigned_staff_id' - 'compliance_officer_id')
    || jsonb_build_object(
      'id', v_new_engagement_id, 'workspace_id', v_share.shared_with_workspace_id,
      'client_id', v_new_client_id, 'status', 'Waiting On Review',
      'source_engagement_share_id', p_engagement_share_id, 'created_at', now(), 'updated_at', now()
    );
  insert into public.engagements (
    id, created_at, client_id, workspace_id, workflow_id, current_stage, priority, review_status,
    assigned_staff_id, reviewer_id, compliance_officer_id, owner_workspace_id, shared_status, open_date,
    due_date, completed_date, archived_date, internal_reference, engagement_number, service_id, updated_at,
    status, source_engagement_share_id, case_type, is_bank_product
  )
  select
    id, created_at, client_id, workspace_id, workflow_id, current_stage, priority, review_status,
    assigned_staff_id, reviewer_id, compliance_officer_id, owner_workspace_id, shared_status, open_date,
    due_date, completed_date, archived_date, internal_reference, engagement_number, service_id, updated_at,
    status, source_engagement_share_id, case_type, is_bank_product
  from jsonb_populate_record(null::public.engagements, v_row);

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
    insert into public.attachments (
      id, entity_id, workspace_id, file_name, storage_path, file_size_bytes, mime_type, uploaded_by,
      created_at, entity_type, category, tags, version, folder_id, is_favorite, is_archived, visibility,
      replaces_attachment_id, is_latest_version, is_locked, ai_metadata
    )
    select
      id, entity_id, workspace_id, file_name, storage_path, file_size_bytes, mime_type, uploaded_by,
      created_at, entity_type, category, tags, version, folder_id, is_favorite, is_archived, visibility,
      replaces_attachment_id, is_latest_version, is_locked, ai_metadata
    from jsonb_populate_record(null::public.attachments, v_row);

    v_paths := v_paths || jsonb_build_object('old_path', v_attachment_rec.storage_path, 'new_path', v_new_storage_path);
  end loop;

  return v_paths;
end;
$function$;
