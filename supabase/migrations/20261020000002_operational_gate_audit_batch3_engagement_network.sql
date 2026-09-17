-- P1: workspace-operational-gate audit -- batch 3 (engagement sharing/review,
-- IRS authorizations, firm tax profile, manual firm connections, workspace tags).
--
-- Same minimal fix pattern throughout. Two functions are only PARTIALLY
-- gated on purpose: respond_to_engagement_share and respond_to_firm_connection
-- both take an accept/approve boolean -- only the accept/approve branch
-- (which finalizes real production work / activates a new live connection)
-- is blocked; the reject/decline branch is left alone as a legitimate
-- recovery/cleanup action, per the standing "preserve legitimate recovery
-- paths, don't blanket-block" rule.

create or replace function public.create_engagement_share(p_engagement_id uuid)
returns engagement_shares
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
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
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

create or replace function public.copy_shared_engagement(p_engagement_share_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
$function$;

create or replace function public.respond_to_engagement_share(p_engagement_share_id uuid, p_approve boolean, p_decision_notes text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ero_workspace_id uuid;
  v_shared_by_workspace_id uuid;
  v_shared_by uuid;
  v_engagement_id uuid;
begin
  select shared_with_workspace_id, workspace_id, shared_by, engagement_id
    into v_ero_workspace_id, v_shared_by_workspace_id, v_shared_by, v_engagement_id
  from public.engagement_shares where id = p_engagement_share_id;
  if v_ero_workspace_id is null then
    raise exception 'engagement share not found';
  end if;
  if not public.is_workspace_member(v_ero_workspace_id) then
    raise exception 'insufficient permissions to respond to this engagement share';
  end if;
  if not public.has_permission(v_ero_workspace_id, 'engagements.approve_review') then
    raise exception 'insufficient permissions to approve or reject engagement reviews';
  end if;
  if p_approve and not public.is_workspace_operational(v_ero_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.engagement_shares set
    status = case when p_approve then 'approved' else 'rejected' end,
    decision_notes = p_decision_notes,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_engagement_share_id;

  insert into public.engagement_review_actions (engagement_share_id, action, actor_id, comment)
  values (p_engagement_share_id, case when p_approve then 'approve' else 'reject' end, auth.uid(), p_decision_notes);

  if v_shared_by is not null then
    perform public.create_notification(
      v_shared_by_workspace_id, v_shared_by, 'ENGAGEMENT_SHARE_' || upper(case when p_approve then 'approved' else 'rejected' end),
      'engagement_share_decision', jsonb_build_object('engagement_share_id', p_engagement_share_id, 'approved', p_approve),
      array['In-App'::text], 'Medium', 'engagement', v_engagement_id
    );
  end if;
end;
$function$;

create or replace function public.resubmit_engagement_share(p_engagement_share_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if not public.is_workspace_operational(v_row.workspace_id) then
    raise exception 'this workspace is not currently operational';
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
$function$;

create or replace function public.share_engagement_with_ero(p_engagement_id uuid, p_workspace_id uuid, p_shared_with_workspace_id uuid, p_shared_items jsonb default '{}'::jsonb, p_expires_in_days integer default 30)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'insufficient permissions to share an engagement from this workspace';
  end if;
  if not public.has_permission(p_workspace_id, 'engagements.share') then
    raise exception 'insufficient permissions to share engagements from this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if not exists (
    select 1 from public.firm_connections
    where relationship_type = 'ero_ptin' and status = 'active'
      and child_workspace_id = p_workspace_id and parent_workspace_id = p_shared_with_workspace_id
  ) then
    raise exception 'no active ERO connection to share this engagement with';
  end if;

  insert into public.engagement_shares (engagement_id, workspace_id, shared_with_workspace_id, shared_items, shared_by, expires_at)
  values (p_engagement_id, p_workspace_id, p_shared_with_workspace_id, coalesce(p_shared_items, '{}'::jsonb), auth.uid(), now() + make_interval(days => p_expires_in_days))
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.create_irs_authorization(p_workspace_id uuid, p_client_id uuid, p_engagement_id uuid, p_taxpayer_type text, p_designee_user_id uuid, p_tax_matters jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_designee_name text;
  v_designee_caf_number text;
begin
  if not public.has_permission(p_workspace_id, 'irs_authorizations.manage') then
    raise exception 'insufficient permissions to create an IRS authorization in this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if p_taxpayer_type not in ('individual', 'business') then
    raise exception 'invalid taxpayer type';
  end if;

  if not exists (select 1 from public.clients where id = p_client_id and workspace_id = p_workspace_id) then
    raise exception 'client not found in this workspace';
  end if;

  if p_engagement_id is not null and not exists (
    select 1 from public.engagements where id = p_engagement_id and workspace_id = p_workspace_id and client_id = p_client_id
  ) then
    raise exception 'engagement not found for this client';
  end if;

  select coalesce(nullif(display_name, ''), nullif(trim(concat_ws(' ', first_name, last_name)), ''), 'Staff member'), caf_number
    into v_designee_name, v_designee_caf_number
  from public.user_profiles
  where id = p_designee_user_id;

  if not found then
    raise exception 'designee not found';
  end if;

  insert into public.irs_authorizations (
    workspace_id, client_id, engagement_id, taxpayer_type,
    designee_user_id, designee_name, designee_caf_number, tax_matters, created_by
  ) values (
    p_workspace_id, p_client_id, p_engagement_id, p_taxpayer_type,
    p_designee_user_id, v_designee_name, v_designee_caf_number, coalesce(p_tax_matters, '[]'::jsonb), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.set_irs_authorization_status(p_authorization_id uuid, p_status irs_authorization_status, p_note text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_current public.irs_authorization_status;
  v_rank_current int;
  v_rank_new int;
  v_order text[] := array[
    'draft', 'awaiting_identity_verification', 'identity_verification_rejected',
    'identity_verified', 'awaiting_signature', 'signed',
    'submitted', 'irs_processing', 'authorized', 'transcript_eligible'
  ];
begin
  select workspace_id, status into v_workspace_id, v_current
  from public.irs_authorizations where id = p_authorization_id;

  if v_workspace_id is null then
    raise exception 'authorization not found';
  end if;

  if not public.has_permission(v_workspace_id, 'irs_authorizations.manage') then
    raise exception 'insufficient permissions to update this authorization''s status';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if v_current in ('denied', 'revoked') then
    raise exception 'this authorization is % and cannot be advanced further', v_current;
  end if;

  if p_status not in ('submitted', 'irs_processing', 'authorized', 'transcript_eligible', 'denied', 'revoked') then
    raise exception 'this status can only be reached automatically (identity verification or signing), not set manually';
  end if;

  if p_status not in ('denied', 'revoked') then
    v_rank_current := array_position(v_order, v_current::text);
    v_rank_new := array_position(v_order, p_status::text);
    if v_rank_current is null or v_rank_new is null or v_rank_new <= v_rank_current then
      raise exception 'cannot move from % to % -- status can only move forward', v_current, p_status;
    end if;
  end if;

  update public.irs_authorizations
  set status = p_status,
      staff_note = coalesce(p_note, staff_note),
      submitted_at = case when p_status = 'submitted' and submitted_at is null then now() else submitted_at end,
      authorized_at = case when p_status = 'authorized' and authorized_at is null then now() else authorized_at end,
      updated_at = now()
  where id = p_authorization_id;
end;
$function$;

create or replace function public.set_firm_tax_profile(p_workspace_id uuid, p_ein text default null::text, p_efin text default null::text, p_ptin text default null::text, p_clear_ein boolean default false, p_clear_efin boolean default false, p_clear_ptin boolean default false, p_supported_filing_states text[] default null::text[], p_regular_office_hours jsonb default null::jsonb, p_tax_season_hours jsonb default null::jsonb, p_caf text default null::text, p_clear_caf boolean default false)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to manage this workspace''s tax profile';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if p_efin is not null and exists (
    select 1 from public.firm_tax_profile
    where efin_hash = public.hash_firm_secret(p_efin) and workspace_id <> p_workspace_id
  ) then
    raise exception 'This EFIN is already registered to another Verexa account.';
  end if;

  if p_ptin is not null and (
    exists (select 1 from public.firm_tax_profile where ptin_hash = public.hash_firm_secret(p_ptin) and workspace_id <> p_workspace_id)
    or exists (select 1 from public.user_profiles where ptin_hash = public.hash_firm_secret(p_ptin))
  ) then
    raise exception 'This PTIN is already registered to another Verexa account.';
  end if;

  insert into public.firm_tax_profile (workspace_id)
  values (p_workspace_id)
  on conflict (workspace_id) do nothing;

  update public.firm_tax_profile set
    ein_encrypted = case when p_clear_ein then null when p_ein is not null then public.encrypt_firm_secret(p_ein) else ein_encrypted end,
    ein_last4 = case when p_clear_ein then null when p_ein is not null then right(regexp_replace(p_ein, '\D', '', 'g'), 4) else ein_last4 end,
    efin_encrypted = case when p_clear_efin then null when p_efin is not null then public.encrypt_firm_secret(p_efin) else efin_encrypted end,
    efin_last4 = case when p_clear_efin then null when p_efin is not null then right(regexp_replace(p_efin, '\D', '', 'g'), 4) else efin_last4 end,
    efin_hash = case when p_clear_efin then null when p_efin is not null then public.hash_firm_secret(p_efin) else efin_hash end,
    ptin_encrypted = case when p_clear_ptin then null when p_ptin is not null then public.encrypt_firm_secret(p_ptin) else ptin_encrypted end,
    ptin_last4 = case when p_clear_ptin then null when p_ptin is not null then right(regexp_replace(p_ptin, '\D', '', 'g'), 4) else ptin_last4 end,
    ptin_hash = case when p_clear_ptin then null when p_ptin is not null then public.hash_firm_secret(p_ptin) else ptin_hash end,
    caf_encrypted = case when p_clear_caf then null when p_caf is not null then public.encrypt_firm_secret(p_caf) else caf_encrypted end,
    caf_last4 = case when p_clear_caf then null when p_caf is not null then right(regexp_replace(p_caf, '\D', '', 'g'), 4) else caf_last4 end,
    supported_filing_states = coalesce(p_supported_filing_states, supported_filing_states),
    regular_office_hours = coalesce(p_regular_office_hours, regular_office_hours),
    tax_season_hours = coalesce(p_tax_season_hours, tax_season_hours),
    updated_by = auth.uid(),
    updated_at = now()
  where workspace_id = p_workspace_id;
end;
$function$;

create or replace function public.send_organizer_to_ero_review(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_engagement_id uuid;
  v_client_name text;
  v_ero_user_id uuid;
begin
  select workspace_id, client_id, engagement_id
  into v_workspace_id, v_client_id, v_engagement_id
  from public.organizer_responses where id = p_response_id;

  if v_workspace_id is null then
    raise exception 'organizer response not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review_ero') then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  select user_id into v_ero_user_id
  from public.workspace_users
  where workspace_id = v_workspace_id and is_owner = true and status = 'active'
  limit 1;

  if v_ero_user_id is null then
    raise exception 'this workspace has no active owner to assign ERO review to';
  end if;

  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), business_name, 'A client')
  into v_client_name
  from public.clients where id = v_client_id;

  update public.organizer_responses set assigned_reviewer_id = v_ero_user_id where id = p_response_id;

  if public.is_notification_enabled(v_ero_user_id, v_workspace_id, 'ORGANIZER_ERO_REVIEW_REQUESTED', 'In-App') then
    perform public.create_notification(
      v_workspace_id, v_ero_user_id, 'ORGANIZER_ERO_REVIEW_REQUESTED', 'organizer_ero_review_requested',
      jsonb_build_object('client_name', v_client_name), array['In-App'], 'High', 'organizer_response', p_response_id
    );
  end if;

  insert into public.tasks (workspace_id, engagement_id, client_id, related_organizer_response_id, title, description, assigned_staff_id, due_date, priority)
  values (
    v_workspace_id, v_engagement_id, case when v_engagement_id is null then v_client_id else null end, p_response_id,
    'ERO review: ' || v_client_name,
    'Review the submitted organizer and read the client''s notes, then approve, deny, or request more information.',
    v_ero_user_id, (now() + interval '1 day')::date, 'high'
  );

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (
    v_workspace_id, auth.uid(), case when v_engagement_id is not null then 'engagement' else 'client' end,
    coalesce(v_engagement_id, v_client_id), 'ORGANIZER_ERO_REVIEW_REQUESTED', 'ORGANIZER_ERO_REVIEW_REQUESTED',
    'Sent an organizer to ERO review', jsonb_build_object('response_id', p_response_id)
  );
end;
$function$;

create or replace function public.create_manual_firm_connection(p_workspace_id uuid, p_relationship_type text, p_name text, p_owner_name text default null::text, p_phone text default null::text, p_email text default null::text, p_website text default null::text, p_address text default null::text, p_notes text default null::text)
returns firm_connections
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.firm_connections;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to add a firm';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if p_relationship_type not in ('service_bureau_ero', 'ero_ptin', 'service_bureau_ptin') then
    raise exception 'invalid relationship_type';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'a firm name is required';
  end if;

  insert into public.firm_connections (
    parent_workspace_id, relationship_type, status, source,
    manual_name, manual_owner_name, manual_phone, manual_email, manual_website, manual_address, notes,
    responded_at
  )
  values (
    p_workspace_id, p_relationship_type, 'active', 'manual',
    btrim(p_name), p_owner_name, p_phone, p_email, p_website, p_address, p_notes,
    now()
  )
  returning * into v_row;

  return v_row;
end;
$function$;

create or replace function public.update_manual_firm_connection(p_connection_id uuid, p_name text, p_owner_name text default null::text, p_phone text default null::text, p_email text default null::text, p_website text default null::text, p_address text default null::text)
returns firm_connections
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.firm_connections;
begin
  select * into v_row from public.firm_connections where id = p_connection_id;
  if v_row.id is null then
    raise exception 'connection not found';
  end if;
  if not public.is_workspace_admin(v_row.parent_workspace_id) then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_row.parent_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if v_row.source <> 'manual' then
    raise exception 'this connection is not a manually-added firm';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'a firm name is required';
  end if;

  update public.firm_connections
  set manual_name = btrim(p_name),
      manual_owner_name = p_owner_name,
      manual_phone = p_phone,
      manual_email = p_email,
      manual_website = p_website,
      manual_address = p_address,
      updated_at = now()
  where id = p_connection_id
  returning * into v_row;

  return v_row;
end;
$function$;

create or replace function public.respond_to_firm_connection(p_connection_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_child_workspace_id uuid;
begin
  select child_workspace_id into v_child_workspace_id
  from public.firm_connections where id = p_connection_id;

  if v_child_workspace_id is null then
    raise exception 'connection not found';
  end if;
  if not public.is_workspace_admin(v_child_workspace_id) then
    raise exception 'insufficient permissions to respond to this connection';
  end if;
  if p_accept and not public.is_workspace_operational(v_child_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.firm_connections
  set status = case when p_accept then 'active' else 'revoked' end,
      responded_by = auth.uid(),
      responded_at = now()
  where id = p_connection_id;
end;
$function$;

create or replace function public.create_workspace_tag(p_workspace_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name text := btrim(p_name);
  v_id uuid;
begin
  if not (public.has_permission(p_workspace_id, 'clients.edit') or public.has_permission(p_workspace_id, 'automations.manage')) then
    raise exception 'insufficient permissions to create a tag in this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if v_name = '' then
    raise exception 'Tag name cannot be empty';
  end if;

  select id into v_id from public.workspace_tags where workspace_id = p_workspace_id and name = v_name;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.workspace_tags (workspace_id, name, created_by)
  values (p_workspace_id, v_name, auth.uid())
  returning id into v_id;
  return v_id;
end;
$function$;
