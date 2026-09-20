-- ============================================================================
-- MIGRATION RECONCILIATION PHASE 1.7 -- RECOVERED FROM PRODUCTION
--
-- Did not previously exist in Git. Applied directly to production on
-- 2026-09-17 (recorded version 20260917131955, name
-- operational_gate_audit_batch4_documents_organizers in
-- supabase_migrations.schema_migrations) without ever being committed here.
-- Reproduced verbatim from schema_migrations.statements. Confidence: A
-- (exact original recovered). Filename uses the real recorded production
-- version so tooling never replays it against this project, while applying
-- correctly on a fresh project.
--
-- Current-state verification (2026-09-20): re-queried pg_proc.prosrc for
-- all 16 functions below directly against production; every one still
-- contains the is_workspace_operational gate added here. Zero drift --
-- including create_document_request, which a later, unrelated main
-- migration (20260921010000_document_request_item_due_date.sql) also
-- touched: that later migration's own copy of this function is MISSING the
-- gate (confirmed by inspection), so recovering this file is what restores
-- git's copy of the gate on this function -- it does not conflict with or
-- get overridden by that later migration, since production's live function
-- (the actual source of truth) already has both changes merged.
-- ============================================================================

create or replace function public.create_document_request(p_workspace_id uuid, p_entity_type text, p_entity_id uuid, p_template_id uuid, p_title text, p_due_date date default null::date)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_request_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'documents.request') then
    raise exception 'insufficient permissions to request documents in this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  insert into public.document_requests (workspace_id, entity_type, entity_id, document_request_template_id, title, due_date, created_by)
  values (p_workspace_id, p_entity_type, p_entity_id, p_template_id, p_title, p_due_date, auth.uid())
  returning id into v_request_id;

  insert into public.document_request_item_statuses (document_request_id, document_request_item_id, name, is_required, status, fulfilled_by_attachment_id, category)
  select
    v_request_id,
    dri.id,
    dri.name,
    dri.is_required,
    coalesce(prior.status, 'pending'),
    prior.fulfilled_by_attachment_id,
    nullif(dri.category, '')
  from public.document_request_items dri
  left join lateral (
    select s.status, s.fulfilled_by_attachment_id
    from public.document_request_item_statuses s
    join public.document_requests r on r.id = s.document_request_id
    where r.entity_type = p_entity_type
      and r.entity_id = p_entity_id
      and s.name = dri.name
      and s.status <> 'pending'
    order by s.updated_at desc
    limit 1
  ) prior on true
  where dri.document_request_template_id = p_template_id;

  return v_request_id;
end;
$function$;

create or replace function public.fulfill_document_request_item(p_item_status_id uuid, p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_folder_name text;
  v_folder_id uuid;
begin
  select r.workspace_id, r.entity_type, r.entity_id, dri.default_folder_name
  into v_workspace_id, v_entity_type, v_entity_id, v_folder_name
  from public.document_request_item_statuses s
  join public.document_requests r on r.id = s.document_request_id
  left join public.document_request_items dri on dri.id = s.document_request_item_id
  where s.id = p_item_status_id;

  if v_workspace_id is null then
    raise exception 'request item not found';
  end if;
  if not (
    public.has_permission(v_workspace_id, 'documents.upload')
    or public.is_portal_user_for_entity(v_entity_type, v_entity_id)
    or public.is_partner_workspace_for_firm_connection(v_workspace_id, v_entity_type, v_entity_id)
  ) then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.document_request_item_statuses
  set status = 'uploaded', fulfilled_by_attachment_id = p_attachment_id, updated_at = now()
  where id = p_item_status_id;

  if v_folder_name is not null then
    select id into v_folder_id
    from public.document_folders
    where entity_type = v_entity_type and entity_id = v_entity_id and name = v_folder_name
    limit 1;

    if v_folder_id is not null then
      update public.attachments set folder_id = v_folder_id where id = p_attachment_id;
    end if;
  end if;
end;
$function$;

create or replace function public.mark_document_request_item_received(p_item_status_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
begin
  select r.workspace_id into v_workspace_id
  from public.document_request_item_statuses s
  join public.document_requests r on r.id = s.document_request_id
  where s.id = p_item_status_id;

  if v_workspace_id is null then
    raise exception 'request item not found';
  end if;
  if not public.has_permission(v_workspace_id, 'documents.upload') then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.document_request_item_statuses
  set status = 'uploaded', updated_at = now()
  where id = p_item_status_id;
end;
$function$;

create or replace function public.mark_document_request_reviewed(p_document_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.document_requests where id = p_document_request_id;
  if v_workspace_id is null then
    raise exception 'document request not found';
  end if;
  if not public.has_permission(v_workspace_id, 'documents.view') then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.document_requests
  set reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_document_request_id and status = 'completed';
end;
$function$;

create or replace function public.set_document_request_item_due_date(p_item_status_id uuid, p_due_date date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
begin
  select r.workspace_id into v_workspace_id
  from public.document_request_item_statuses s
  join public.document_requests r on r.id = s.document_request_id
  where s.id = p_item_status_id;

  if v_workspace_id is null then
    raise exception 'request item not found';
  end if;
  if not public.has_permission(v_workspace_id, 'documents.upload') then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.document_request_item_statuses
  set due_date = p_due_date, updated_at = now()
  where id = p_item_status_id;
end;
$function$;

create or replace function public.create_organizer_information_request(p_response_id uuid, p_message text, p_organizer_field_id uuid default null::uuid, p_send_email boolean default false, p_send_sms boolean default false, p_show_in_portal boolean default true)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_engagement_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_primary_email text;
  v_primary_phone text;
  v_request_id uuid;
  v_thread_id uuid;
begin
  select workspace_id, client_id, engagement_id into v_workspace_id, v_client_id, v_engagement_id
  from public.organizer_responses where id = p_response_id;

  if v_workspace_id is null then
    raise exception 'organizer response not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if nullif(btrim(p_message), '') is null then
    raise exception 'a message is required';
  end if;

  v_entity_type := case when v_engagement_id is not null then 'engagement' else 'client' end;
  v_entity_id := coalesce(v_engagement_id, v_client_id);

  insert into public.organizer_information_requests
    (workspace_id, organizer_response_id, organizer_field_id, created_by, message, sent_via_email, sent_via_sms, shown_in_portal)
  values (v_workspace_id, p_response_id, p_organizer_field_id, auth.uid(), p_message, p_send_email, p_send_sms, p_show_in_portal)
  returning id into v_request_id;

  perform public.set_organizer_response_review_status(p_response_id, 'Corrections Requested', p_message);

  if p_send_email or p_send_sms then
    select primary_email, primary_phone into v_primary_email, v_primary_phone
    from public.clients where id = v_client_id;
  end if;

  if p_send_email and v_primary_email is not null then
    insert into public.notification_queue (workspace_id, recipient_email, channel, template_key, payload, entity_type, entity_id, event_type)
    values (v_workspace_id, v_primary_email, 'Email', 'organizer-information-request',
      jsonb_build_object('message', p_message), v_entity_type, v_entity_id, 'organizer_information_request');
  end if;

  if p_send_sms and v_primary_phone is not null then
    insert into public.notification_queue (workspace_id, recipient_phone, channel, template_key, payload, entity_type, entity_id, event_type)
    values (v_workspace_id, v_primary_phone, 'SMS', 'organizer-information-request',
      jsonb_build_object('message', p_message), v_entity_type, v_entity_id, 'organizer_information_request');
  end if;

  if p_show_in_portal then
    select id into v_thread_id from public.message_threads
    where workspace_id = v_workspace_id and entity_type = 'client' and entity_id = v_client_id and status = 'open'
    order by coalesce(last_message_at, created_at) desc
    limit 1;

    if v_thread_id is null then
      insert into public.message_threads (workspace_id, entity_type, entity_id, subject, channel)
      values (v_workspace_id, 'client', v_client_id, 'Information needed on your organizer', 'portal')
      returning id into v_thread_id;
    end if;

    insert into public.messages (workspace_id, thread_id, sender_type, is_internal, body)
    values (v_workspace_id, v_thread_id, 'staff', false, p_message);

    update public.message_threads set last_message_at = now() where id = v_thread_id;
  end if;

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), v_entity_type, v_entity_id, 'ORGANIZER_INFO_REQUESTED', 'ORGANIZER_INFO_REQUESTED',
    'Requested information on an organizer', jsonb_build_object('request_id', v_request_id, 'response_id', p_response_id));

  return v_request_id;
end;
$function$;

create or replace function public.send_organizer_information_request(p_request_id uuid, p_message text, p_due_date date default null::date, p_tags text[] default '{}'::text[], p_send_email boolean default false, p_send_sms boolean default false, p_show_in_portal boolean default true)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_response_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_engagement_id uuid;
  v_client_id uuid;
begin
  select req.workspace_id, req.organizer_response_id
  into v_workspace_id, v_response_id
  from public.organizer_information_requests req
  where req.id = p_request_id and req.status = 'draft';

  if v_workspace_id is null then
    raise exception 'draft information request not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review_request_info') then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if nullif(btrim(p_message), '') is null then
    raise exception 'a message is required';
  end if;
  if not exists (select 1 from public.organizer_information_request_items where request_id = p_request_id) then
    raise exception 'add at least one item before sending';
  end if;

  select client_id, engagement_id into v_client_id, v_engagement_id
  from public.organizer_responses where id = v_response_id;
  v_entity_type := case when v_engagement_id is not null then 'engagement' else 'client' end;
  v_entity_id := coalesce(v_engagement_id, v_client_id);

  update public.organizer_information_requests
  set status = 'active', message = p_message, due_date = p_due_date, tags = coalesce(p_tags, '{}'),
    sent_via_email = p_send_email, sent_via_sms = p_send_sms, shown_in_portal = p_show_in_portal
  where id = p_request_id;

  perform public.set_organizer_response_review_status(v_response_id, 'Corrections Requested', p_message);
  perform public.notify_organizer_information_request(p_request_id, p_message);

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), v_entity_type, v_entity_id, 'ORGANIZER_INFO_REQUESTED', 'ORGANIZER_INFO_REQUESTED',
    'Requested information on an organizer', jsonb_build_object('request_id', p_request_id, 'response_id', v_response_id));
end;
$function$;

create or replace function public.resolve_organizer_information_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_response_id uuid;
  v_client_id uuid;
  v_engagement_id uuid;
  v_entity_type text;
  v_entity_id uuid;
begin
  select req.workspace_id, req.organizer_response_id, r.client_id, r.engagement_id
  into v_workspace_id, v_response_id, v_client_id, v_engagement_id
  from public.organizer_information_requests req
  join public.organizer_responses r on r.id = req.organizer_response_id
  where req.id = p_request_id;

  if v_workspace_id is null then
    raise exception 'information request not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.organizer_information_requests
  set status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
  where id = p_request_id;

  v_entity_type := case when v_engagement_id is not null then 'engagement' else 'client' end;
  v_entity_id := coalesce(v_engagement_id, v_client_id);

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), v_entity_type, v_entity_id, 'ORGANIZER_INFO_RESOLVED', 'ORGANIZER_INFO_RESOLVED',
    'Resolved an organizer information request', jsonb_build_object('request_id', p_request_id, 'response_id', v_response_id));
end;
$function$;

create or replace function public.mark_organizer_information_request_responded(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.organizer_information_requests where id = p_request_id;
  if v_workspace_id is null then
    raise exception 'information request not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.organizer_information_requests
  set status = 'responded', responded_at = now()
  where id = p_request_id;
end;
$function$;

create or replace function public.approve_organizer_information_request_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_response_id uuid;
  v_field_id uuid;
  v_instance_index int;
  v_status text;
  v_proposed_value jsonb;
begin
  select req.workspace_id, req.organizer_response_id, item.organizer_field_id, item.instance_index, item.status, item.proposed_value
  into v_workspace_id, v_response_id, v_field_id, v_instance_index, v_status, v_proposed_value
  from public.organizer_information_request_items item
  join public.organizer_information_requests req on req.id = item.request_id
  where item.id = p_item_id;

  if v_workspace_id is null then
    raise exception 'information request item not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review_request_info') then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if v_status <> 'client_responded' or v_proposed_value is null then
    raise exception 'this item has no pending response to approve';
  end if;

  insert into public.organizer_response_answers (organizer_response_id, organizer_field_id, instance_index, value)
  values (v_response_id, v_field_id, v_instance_index, v_proposed_value)
  on conflict (organizer_response_id, organizer_field_id, instance_index)
  do update set value = excluded.value, updated_at = now();

  update public.organizer_information_request_items
  set status = 'approved', resolved_by = auth.uid(), resolved_at = now()
  where id = p_item_id;
end;
$function$;

create or replace function public.flag_organizer_field_for_info(p_organizer_response_id uuid, p_organizer_field_id uuid, p_instance_index integer default 0, p_note text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_request_id uuid;
  v_item_id uuid;
  v_has_answer boolean;
begin
  select workspace_id into v_workspace_id
  from public.organizer_responses where id = p_organizer_response_id;

  if v_workspace_id is null then
    raise exception 'organizer response not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review_request_info') then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  select id into v_request_id
  from public.organizer_information_requests
  where organizer_response_id = p_organizer_response_id and status = 'draft'
  limit 1;

  if v_request_id is null then
    insert into public.organizer_information_requests (workspace_id, organizer_response_id, created_by, status)
    values (v_workspace_id, p_organizer_response_id, auth.uid(), 'draft')
    returning id into v_request_id;
  end if;

  select id into v_item_id
  from public.organizer_information_request_items
  where request_id = v_request_id
    and organizer_field_id = p_organizer_field_id
    and instance_index = p_instance_index
    and status not in ('resolved', 'approved', 'rejected');

  if v_item_id is not null then
    update public.organizer_information_request_items
    set note = p_note
    where id = v_item_id;
    return v_item_id;
  end if;

  select exists (
    select 1 from public.organizer_response_answers
    where organizer_response_id = p_organizer_response_id
      and organizer_field_id = p_organizer_field_id
      and instance_index = p_instance_index
      and value is not null and value not in ('null'::jsonb, '""'::jsonb)
  ) into v_has_answer;

  insert into public.organizer_information_request_items
    (request_id, organizer_field_id, instance_index, note, was_answered_when_flagged)
  values (v_request_id, p_organizer_field_id, p_instance_index, p_note, v_has_answer)
  returning id into v_item_id;

  return v_item_id;
end;
$function$;

create or replace function public.attest_signature_presence(p_signer_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
begin
  select r.workspace_id into v_workspace_id
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  where s.id = p_signer_id;

  if v_workspace_id is null then
    raise exception 'signer not found';
  end if;

  if not public.has_permission(v_workspace_id, 'signatures.request') then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.signature_request_signers
  set attested_by = auth.uid(), attested_at = now()
  where id = p_signer_id;
end;
$function$;

create or replace function public.set_signature_request_expiry(p_signature_request_id uuid, p_expires_at timestamp with time zone)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.signature_requests where id = p_signature_request_id;
  if v_workspace_id is null then
    raise exception 'signature request not found';
  end if;
  if not public.has_permission(v_workspace_id, 'signatures.request') then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.signature_request_signers
  set expires_at = p_expires_at
  where signature_request_id = p_signature_request_id and status = 'pending';
end;
$function$;

create or replace function public.set_organizer_answer_review_status(p_answer_id uuid, p_status review_status, p_note text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_entity_type text;
  v_entity_id uuid;
begin
  select r.workspace_id, case when r.engagement_id is not null then 'engagement' else 'client' end, coalesce(r.engagement_id, r.client_id)
  into v_workspace_id, v_entity_type, v_entity_id
  from public.organizer_response_answers a
  join public.organizer_responses r on r.id = a.organizer_response_id
  where a.id = p_answer_id;

  if v_workspace_id is null then
    raise exception 'organizer answer not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.organizer_response_answers
  set review_status = p_status, review_note = p_note
  where id = p_answer_id;

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), v_entity_type, v_entity_id, 'ORGANIZER_ANSWER_REVIEWED', 'ORGANIZER_ANSWER_REVIEWED',
    'Marked an organizer answer "' || p_status || '"', jsonb_build_object('answer_id', p_answer_id));
end;
$function$;

create or replace function public.reorder_organizer_fields(p_template_id uuid, p_field_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_field_id uuid;
  v_idx int := 0;
  v_total int;
  v_matched int;
begin
  select workspace_id into v_workspace_id from organizer_templates where id = p_template_id;
  if v_workspace_id is null then
    raise exception 'cannot edit a system default organizer -- clone it first';
  end if;
  if not is_workspace_admin(v_workspace_id) then
    raise exception 'insufficient permissions to edit this organizer';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  select count(*) into v_total from organizer_fields where organizer_template_id = p_template_id;
  if coalesce(array_length(p_field_ids, 1), 0) <> v_total then
    raise exception 'reorder list must include every field on this organizer exactly once';
  end if;

  select count(*) into v_matched
  from organizer_fields
  where organizer_template_id = p_template_id and id = any(p_field_ids);
  if v_matched <> v_total then
    raise exception 'reorder list must include every field on this organizer exactly once';
  end if;

  foreach v_field_id in array p_field_ids loop
    update organizer_fields set display_order = v_idx where id = v_field_id;
    v_idx := v_idx + 1;
  end loop;
end;
$function$;

create or replace function public.delete_installed_template(p_workspace_id uuid, p_installation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_installation record;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to delete templates in this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  select * into v_installation
  from public.workspace_template_installations
  where id = p_installation_id and workspace_id = p_workspace_id;

  if v_installation is null then
    raise exception 'installed template not found';
  end if;

  perform public.set_config_object_status(v_installation.source_table, v_installation.copy_object_id, 'archived');

  if v_installation.source_table = 'automations' then
    update public.automations set is_enabled = false where id = v_installation.copy_object_id;
  end if;
end;
$function$;
