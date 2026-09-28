-- Contact Sharing Phase 2: the seven RPCs that are the ONLY write path
-- for every table created in Phase 1 (no direct INSERT/UPDATE/DELETE
-- policy exists on any of them). Every function here is SECURITY
-- DEFINER with a pinned search_path, derives every workspace id it uses
-- for authorization from the resource itself (never from a caller-
-- supplied argument), and calls has_permission/is_workspace_member/
-- is_workspace_operational explicitly in its own body -- satisfying the
-- database-contract-guard's recognized-auth heuristic directly, not by
-- baseline exception.
--
-- Repeating-category version snapshots (PHONE/EMAIL/ADDRESS/
-- SERVICE_INTERESTS) store one pipe-delimited scalar value per ordinal
-- position per version (e.g. field_name='phone_1', value='(555) 123-
-- 4567|mobile|true') rather than one row per sub-field -- still a plain
-- normalized column, not a JSONB blob, chosen to keep this already-large
-- migration's per-category blocks a manageable size while preserving the
-- "every version independently reconstructable, no diff replay" guarantee.

-- ============================================================
-- RPC 1: create_contact_share -- PTIN initiates a share (initial or
-- proactive update; the RPC itself determines which by checking for an
-- existing retained record).
-- ============================================================
create or replace function public.create_contact_share(p_client_id uuid, p_category_keys text[])
returns public.contact_shares
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_source_workspace_id uuid;
  v_source_workspace_type text;
  v_destination_workspace_id uuid;
  v_firm_connection_id uuid;
  v_reviewer_id uuid;
  v_transfer_kind text;
  v_category text;
  v_dob date;
  v_row public.contact_shares;
  v_recipient record;
begin
  select workspace_id into v_source_workspace_id from public.clients where id = p_client_id;
  if v_source_workspace_id is null then
    raise exception 'contact not found';
  end if;

  select workspace_type into v_source_workspace_type from public.workspaces where id = v_source_workspace_id;
  if v_source_workspace_type <> 'independent_ptin' then
    raise exception 'only an Independent PTIN workspace can share a Contact with an ERO';
  end if;

  if not public.has_permission(v_source_workspace_id, 'clients.share') then
    raise exception 'insufficient permissions to share this Contact';
  end if;
  if not public.is_workspace_operational(v_source_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if p_category_keys is null or array_length(p_category_keys, 1) is null then
    raise exception 'at least one category must be selected';
  end if;
  foreach v_category in array p_category_keys loop
    if v_category not in ('IDENTIFYING_INFO', 'PHONE', 'EMAIL', 'ADDRESS', 'SERVICE_INTERESTS', 'DOCUMENTS') then
      raise exception 'unsupported category: %', v_category;
    end if;
  end loop;

  if 'IDENTIFYING_INFO' = any(p_category_keys) then
    select date_of_birth into v_dob from public.clients where id = p_client_id;
    if v_dob is not null and not public.has_permission(v_source_workspace_id, 'clients.edit_sensitive') then
      raise exception 'sharing date of birth requires clients.edit_sensitive';
    end if;
  end if;

  select fc.id, fc.parent_workspace_id, fc.default_reviewer_id
    into v_firm_connection_id, v_destination_workspace_id, v_reviewer_id
  from public.firm_connections fc
  where fc.child_workspace_id = v_source_workspace_id
    and fc.relationship_type = 'ero_ptin'
    and fc.status = 'active';

  if v_destination_workspace_id is null then
    raise exception 'this workspace has no active ERO connection';
  end if;

  update public.contact_shares
    set status = 'expired'
  where source_client_id = p_client_id
    and destination_workspace_id = v_destination_workspace_id
    and status in ('pending', 'corrections_requested')
    and expires_at is not null and expires_at < now();

  if exists (
    select 1 from public.contact_shares
    where source_client_id = p_client_id
      and destination_workspace_id = v_destination_workspace_id
      and status in ('pending', 'corrections_requested')
  ) then
    raise exception 'a share request for this Contact is already in progress with this ERO';
  end if;

  v_transfer_kind := case when exists (
    select 1 from public.ero_retained_contacts
    where workspace_id = v_destination_workspace_id
      and source_workspace_id = v_source_workspace_id
      and source_client_id = p_client_id
  ) then 'update' else 'initial' end;

  insert into public.contact_shares (
    source_workspace_id, source_client_id, destination_workspace_id, firm_connection_id,
    initiated_by, initiated_by_user_id, status, transfer_kind, reviewer_id
  ) values (
    v_source_workspace_id, p_client_id, v_destination_workspace_id, v_firm_connection_id,
    'source', auth.uid(), 'pending', v_transfer_kind, v_reviewer_id
  ) returning * into v_row;

  insert into public.contact_share_categories (contact_share_id, category_key)
  select v_row.id, cat from unnest(p_category_keys) as cat
  on conflict do nothing;

  insert into public.contact_share_actions (contact_share_id, action, actor_id)
  values (v_row.id, 'requested', auth.uid());

  if v_reviewer_id is not null then
    perform public.create_notification(
      v_destination_workspace_id, v_reviewer_id,
      case when v_transfer_kind = 'update' then 'CONTACT_UPDATE_AVAILABLE' else 'CONTACT_SHARE_REQUESTED' end,
      'contact_share_requested', jsonb_build_object('contact_share_id', v_row.id, 'transfer_kind', v_transfer_kind),
      array['In-App'::text], 'Medium', 'contact_share', v_row.id
    );
  else
    for v_recipient in
      select wu.user_id from public.workspace_users wu
      join public.roles r on r.id = wu.role_id
      where wu.workspace_id = v_destination_workspace_id and wu.status = 'active'
        and (wu.is_owner or r.slug in ('owner', 'admin'))
    loop
      perform public.create_notification(
        v_destination_workspace_id, v_recipient.user_id,
        case when v_transfer_kind = 'update' then 'CONTACT_UPDATE_AVAILABLE' else 'CONTACT_SHARE_REQUESTED' end,
        'contact_share_requested', jsonb_build_object('contact_share_id', v_row.id, 'transfer_kind', v_transfer_kind),
        array['In-App'::text], 'Medium', 'contact_share', v_row.id
      );
    end loop;
  end if;

  return v_row;
end;
$function$;

revoke all on function public.create_contact_share(uuid, text[]) from public, anon;
grant execute on function public.create_contact_share(uuid, text[]) to authenticated;

-- ============================================================
-- RPC 2: request_contact_share_update -- ERO requests an update. Reads
-- NO source Contact data at all -- resolves only workspace/client
-- identity from the already-retained record, never the live source row.
-- ============================================================
create or replace function public.request_contact_share_update(p_retained_contact_id uuid, p_category_keys text[])
returns public.contact_shares
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_retained public.ero_retained_contacts;
  v_category text;
  v_row public.contact_shares;
  v_recipient record;
begin
  select * into v_retained from public.ero_retained_contacts where id = p_retained_contact_id;
  if v_retained.id is null then
    raise exception 'retained Contact record not found';
  end if;

  if not public.is_workspace_member(v_retained.workspace_id) then
    raise exception 'insufficient permissions to request an update for this retained Contact';
  end if;
  if not public.has_permission(v_retained.workspace_id, 'clients.request_share_update') then
    raise exception 'insufficient permissions to request an update for this retained Contact';
  end if;
  if not public.is_workspace_operational(v_retained.workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if v_retained.current_firm_connection_id is null or not exists (
    select 1 from public.firm_connections where id = v_retained.current_firm_connection_id and status = 'active'
  ) then
    raise exception 'this retained Contact has no active ERO connection -- cannot request an update';
  end if;

  if p_category_keys is null or array_length(p_category_keys, 1) is null then
    raise exception 'at least one category must be selected';
  end if;
  foreach v_category in array p_category_keys loop
    if v_category not in ('IDENTIFYING_INFO', 'PHONE', 'EMAIL', 'ADDRESS', 'SERVICE_INTERESTS', 'DOCUMENTS') then
      raise exception 'unsupported category: %', v_category;
    end if;
  end loop;

  update public.contact_shares
    set status = 'expired'
  where source_client_id = v_retained.source_client_id
    and destination_workspace_id = v_retained.workspace_id
    and status in ('pending', 'corrections_requested')
    and expires_at is not null and expires_at < now();

  if exists (
    select 1 from public.contact_shares
    where source_client_id = v_retained.source_client_id
      and destination_workspace_id = v_retained.workspace_id
      and status in ('pending', 'corrections_requested')
  ) then
    raise exception 'a share request for this Contact is already in progress';
  end if;

  insert into public.contact_shares (
    source_workspace_id, source_client_id, destination_workspace_id, firm_connection_id,
    initiated_by, initiated_by_user_id, status, transfer_kind, reviewer_id
  ) values (
    v_retained.source_workspace_id, v_retained.source_client_id, v_retained.workspace_id, v_retained.current_firm_connection_id,
    'destination', auth.uid(), 'pending', 'update', null
  ) returning * into v_row;

  insert into public.contact_share_categories (contact_share_id, category_key)
  select v_row.id, cat from unnest(p_category_keys) as cat
  on conflict do nothing;

  insert into public.contact_share_actions (contact_share_id, action, actor_id)
  values (v_row.id, 'update_requested', auth.uid());

  for v_recipient in
    select wu.user_id from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    where wu.workspace_id = v_retained.source_workspace_id and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  loop
    perform public.create_notification(
      v_retained.source_workspace_id, v_recipient.user_id, 'CONTACT_SHARE_UPDATE_REQUESTED',
      'contact_share_update_requested', jsonb_build_object('contact_share_id', v_row.id),
      array['In-App'::text], 'Medium', 'contact_share', v_row.id
    );
  end loop;

  return v_row;
end;
$function$;

revoke all on function public.request_contact_share_update(uuid, text[]) from public, anon;
grant execute on function public.request_contact_share_update(uuid, text[]) to authenticated;

-- ============================================================
-- RPC 3: respond_to_contact_share -- approve/reject/request_corrections.
-- Approver side is explicitly derived from initiated_by, never inferred
-- from a nullable actor column.
-- ============================================================
create or replace function public.respond_to_contact_share(p_share_id uuid, p_decision text, p_notes text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_share public.contact_shares;
  v_approver_workspace_id uuid;
  v_notify_workspace_id uuid;
  v_new_status text;
  v_action text;
  v_event_type text;
begin
  if p_decision not in ('approve', 'reject', 'request_corrections') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select * into v_share from public.contact_shares where id = p_share_id for update;
  if v_share.id is null then
    raise exception 'contact share not found';
  end if;

  if v_share.expires_at is not null and v_share.expires_at < now() and v_share.status in ('pending', 'corrections_requested') then
    update public.contact_shares set status = 'expired' where id = p_share_id;
    raise exception 'this share request has expired';
  end if;

  if v_share.status not in ('pending', 'corrections_requested') then
    raise exception 'this share is not awaiting a decision';
  end if;

  v_approver_workspace_id := case when v_share.initiated_by = 'source' then v_share.destination_workspace_id else v_share.source_workspace_id end;
  v_notify_workspace_id := case when v_share.initiated_by = 'source' then v_share.source_workspace_id else v_share.destination_workspace_id end;

  if not public.is_workspace_member(v_approver_workspace_id) then
    raise exception 'insufficient permissions to respond to this share';
  end if;
  if not public.has_permission(v_approver_workspace_id, 'clients.approve_share') then
    raise exception 'insufficient permissions to respond to this share';
  end if;

  if p_decision = 'approve' then
    if not public.is_workspace_operational(v_approver_workspace_id) then
      raise exception 'this workspace is not currently operational';
    end if;
    if not exists (select 1 from public.firm_connections where id = v_share.firm_connection_id and status = 'active') then
      raise exception 'this Contact''s ERO connection is no longer active';
    end if;
    v_new_status := 'approved';
    v_action := 'approve';
    v_event_type := 'CONTACT_SHARE_APPROVED';
  elsif p_decision = 'reject' then
    v_new_status := 'rejected';
    v_action := 'reject';
    v_event_type := 'CONTACT_SHARE_REJECTED';
  else
    v_new_status := 'corrections_requested';
    v_action := 'request_corrections';
    v_event_type := 'CONTACT_SHARE_CORRECTIONS_REQUESTED';
  end if;

  update public.contact_shares
    set status = v_new_status, decision_notes = p_notes, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_share_id;

  insert into public.contact_share_actions (contact_share_id, action, actor_id, comment)
  values (p_share_id, v_action, auth.uid(), p_notes);

  if v_share.initiated_by_user_id is not null then
    perform public.create_notification(
      v_notify_workspace_id, v_share.initiated_by_user_id, v_event_type,
      'contact_share_decision', jsonb_build_object('contact_share_id', p_share_id, 'decision', p_decision),
      array['In-App'::text], 'Medium', 'contact_share', p_share_id
    );
  end if;
end;
$function$;

revoke all on function public.respond_to_contact_share(uuid, text, text) from public, anon;
grant execute on function public.respond_to_contact_share(uuid, text, text) to authenticated;

-- ============================================================
-- RPC 4: execute_contact_share_transfer -- the sole durable-database-
-- mutation point for a retained record. Never calls Storage, never
-- claims bytes were copied -- document rows are created with
-- transferred_at = NULL ("pending_copy"); mark_contact_document_
-- transferred() is the only thing that ever sets it, after the external
-- Storage copy is confirmed to have actually happened.
-- ============================================================
create or replace function public.execute_contact_share_transfer(p_share_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_share public.contact_shares;
  v_approver_workspace_id uuid;
  v_retained_id uuid;
  v_retained public.ero_retained_contacts;
  v_categories text[];
  v_ever_categories text[];
  v_version_id uuid;
  v_version_number integer;
  v_changed boolean := false;
  v_client record;
  v_doc record;
  v_paths jsonb := '[]'::jsonb;
  v_dest_path text;
  v_new_attachment_id uuid;
  v_transfer_id uuid;
  v_notify_workspace_id uuid;
begin
  select * into v_share from public.contact_shares where id = p_share_id for update;
  if v_share.id is null then
    raise exception 'contact share not found';
  end if;

  v_approver_workspace_id := case when v_share.initiated_by = 'source' then v_share.destination_workspace_id else v_share.source_workspace_id end;
  if not public.has_permission(v_approver_workspace_id, 'clients.approve_share') then
    raise exception 'insufficient permissions to execute this transfer';
  end if;
  if not public.is_workspace_operational(v_share.destination_workspace_id) then
    raise exception 'the destination workspace is not currently operational';
  end if;
  if not exists (select 1 from public.firm_connections where id = v_share.firm_connection_id and status = 'active') then
    raise exception 'this Contact''s ERO connection is no longer active';
  end if;

  -- Idempotent re-run: if this share already reached a terminal outcome,
  -- return the still-pending document plan (if any) rather than
  -- re-mutating anything.
  if v_share.status in ('transferred', 'completed_no_change') then
    select coalesce(jsonb_agg(jsonb_build_object('transfer_id', id, 'source_path', source_storage_path, 'destination_path', destination_storage_path)), '[]'::jsonb)
      into v_paths
    from public.contact_document_transfers
    where contact_share_id = p_share_id and transferred_at is null;
    return v_paths;
  end if;

  if v_share.status <> 'approved' then
    raise exception 'this share has not been approved';
  end if;

  select array_agg(category_key) into v_categories from public.contact_share_categories where contact_share_id = p_share_id;

  select id into v_retained_id from public.ero_retained_contacts
  where workspace_id = v_share.destination_workspace_id
    and source_workspace_id = v_share.source_workspace_id
    and source_client_id = v_share.source_client_id;

  if v_retained_id is null then
    insert into public.ero_retained_contacts (
      workspace_id, source_workspace_id, source_client_id, current_firm_connection_id,
      status, first_transferred_at, last_updated_at
    ) values (
      v_share.destination_workspace_id, v_share.source_workspace_id, v_share.source_client_id, v_share.firm_connection_id,
      'active', now(), now()
    ) returning id into v_retained_id;
  else
    update public.ero_retained_contacts
      set status = 'active', current_firm_connection_id = v_share.firm_connection_id, last_updated_at = now()
    where id = v_retained_id;
  end if;

  select * into v_retained from public.ero_retained_contacts where id = v_retained_id for update;

  if 'IDENTIFYING_INFO' = any(v_categories) then
    select first_name, middle_name, last_name, suffix, client_type, business_name, date_of_birth
      into v_client
    from public.clients where id = v_share.source_client_id;

    if v_client.first_name is distinct from v_retained.first_name
      or v_client.middle_name is distinct from v_retained.middle_name
      or v_client.last_name is distinct from v_retained.last_name
      or v_client.suffix is distinct from v_retained.suffix
      or v_client.client_type is distinct from v_retained.client_type
      or v_client.business_name is distinct from v_retained.business_name
      or v_client.date_of_birth is distinct from v_retained.date_of_birth
    then
      v_changed := true;
    end if;

    update public.ero_retained_contacts set
      first_name = v_client.first_name, middle_name = v_client.middle_name, last_name = v_client.last_name,
      suffix = v_client.suffix, client_type = v_client.client_type, business_name = v_client.business_name,
      date_of_birth = v_client.date_of_birth
    where id = v_retained_id;
  end if;

  if 'PHONE' = any(v_categories) then
    if exists (
      select phone_number, phone_type, is_primary from public.client_phones where client_id = v_share.source_client_id
      except
      select phone_number, phone_type, is_primary from public.ero_retained_contact_phones where retained_contact_id = v_retained_id
    ) or exists (
      select phone_number, phone_type, is_primary from public.ero_retained_contact_phones where retained_contact_id = v_retained_id
      except
      select phone_number, phone_type, is_primary from public.client_phones where client_id = v_share.source_client_id
    ) then
      v_changed := true;
    end if;
    delete from public.ero_retained_contact_phones where retained_contact_id = v_retained_id;
    insert into public.ero_retained_contact_phones (retained_contact_id, phone_number, phone_type, is_primary, display_order)
    select v_retained_id, phone_number, phone_type, is_primary, display_order from public.client_phones where client_id = v_share.source_client_id;
  end if;

  if 'EMAIL' = any(v_categories) then
    if exists (
      select email::text, email_type, is_primary from public.client_emails where client_id = v_share.source_client_id
      except
      select email, email_type, is_primary from public.ero_retained_contact_emails where retained_contact_id = v_retained_id
    ) or exists (
      select email, email_type, is_primary from public.ero_retained_contact_emails where retained_contact_id = v_retained_id
      except
      select email::text, email_type, is_primary from public.client_emails where client_id = v_share.source_client_id
    ) then
      v_changed := true;
    end if;
    delete from public.ero_retained_contact_emails where retained_contact_id = v_retained_id;
    insert into public.ero_retained_contact_emails (retained_contact_id, email, email_type, is_primary, display_order)
    select v_retained_id, email::text, email_type, is_primary, display_order from public.client_emails where client_id = v_share.source_client_id;
  end if;

  if 'ADDRESS' = any(v_categories) then
    if exists (
      select address_type, street, street2, city, state, zip, is_primary from public.client_addresses where client_id = v_share.source_client_id
      except
      select address_type, street, street2, city, state, zip, is_primary from public.ero_retained_contact_addresses where retained_contact_id = v_retained_id
    ) or exists (
      select address_type, street, street2, city, state, zip, is_primary from public.ero_retained_contact_addresses where retained_contact_id = v_retained_id
      except
      select address_type, street, street2, city, state, zip, is_primary from public.client_addresses where client_id = v_share.source_client_id
    ) then
      v_changed := true;
    end if;
    delete from public.ero_retained_contact_addresses where retained_contact_id = v_retained_id;
    insert into public.ero_retained_contact_addresses (retained_contact_id, address_type, street, street2, city, state, zip, is_primary, display_order)
    select v_retained_id, address_type, street, street2, city, state, zip, is_primary, display_order from public.client_addresses where client_id = v_share.source_client_id;
  end if;

  if 'SERVICE_INTERESTS' = any(v_categories) then
    if exists (
      select sc.name as service_category_name, s.name as service_name
      from public.client_service_interests csi
      left join public.service_categories sc on sc.id = csi.service_category_id
      left join public.services s on s.id = csi.service_id
      where csi.client_id = v_share.source_client_id
      except
      select service_category_name, service_name from public.ero_retained_contact_service_interests where retained_contact_id = v_retained_id
    ) or exists (
      select service_category_name, service_name from public.ero_retained_contact_service_interests where retained_contact_id = v_retained_id
      except
      select sc.name as service_category_name, s.name as service_name
      from public.client_service_interests csi
      left join public.service_categories sc on sc.id = csi.service_category_id
      left join public.services s on s.id = csi.service_id
      where csi.client_id = v_share.source_client_id
    ) then
      v_changed := true;
    end if;
    delete from public.ero_retained_contact_service_interests where retained_contact_id = v_retained_id;
    insert into public.ero_retained_contact_service_interests (retained_contact_id, service_category_name, service_name)
    select v_retained_id, sc.name, s.name
    from public.client_service_interests csi
    left join public.service_categories sc on sc.id = csi.service_category_id
    left join public.services s on s.id = csi.service_id
    where csi.client_id = v_share.source_client_id;
  end if;

  if 'DOCUMENTS' = any(v_categories) then
    for v_doc in
      select a.id, a.file_name, a.storage_path, a.mime_type, a.file_size_bytes, a.category
      from public.attachments a
      where a.entity_type = 'client' and a.entity_id = v_share.source_client_id
        and a.visibility = 'client_visible' and a.is_archived = false
        and not exists (
          select 1 from public.contact_document_transfers cdt
          where cdt.contact_share_id = p_share_id and cdt.source_attachment_id = a.id
        )
    loop
      v_changed := true;
      v_dest_path := v_share.destination_workspace_id || '/' || v_retained_id || '/' || v_doc.id || '-' || v_doc.file_name;
      v_new_attachment_id := gen_random_uuid();

      insert into public.attachments (
        id, workspace_id, entity_type, entity_id, file_name, storage_path, file_size_bytes,
        mime_type, uploaded_by, category, visibility
      ) values (
        v_new_attachment_id, v_share.destination_workspace_id, 'ero_retained_contact', v_retained_id, v_doc.file_name, v_dest_path,
        v_doc.file_size_bytes, v_doc.mime_type, auth.uid(), v_doc.category, 'client_visible'
      );

      insert into public.contact_document_transfers (
        contact_share_id, source_attachment_id, destination_attachment_id, source_storage_path, destination_storage_path
      ) values (
        p_share_id, v_doc.id, v_new_attachment_id, v_doc.storage_path, v_dest_path
      ) returning id into v_transfer_id;

      v_paths := v_paths || jsonb_build_object('transfer_id', v_transfer_id, 'source_path', v_doc.storage_path, 'destination_path', v_dest_path);
    end loop;
  end if;

  v_notify_workspace_id := case when v_share.initiated_by = 'source' then v_share.source_workspace_id else v_share.destination_workspace_id end;

  if not v_changed then
    update public.contact_shares set status = 'completed_no_change' where id = p_share_id;
    insert into public.contact_share_actions (contact_share_id, action, actor_id)
    values (p_share_id, 'completed_no_change', auth.uid());

    if v_share.initiated_by_user_id is not null then
      perform public.create_notification(
        v_notify_workspace_id, v_share.initiated_by_user_id, 'CONTACT_SHARE_TRANSFER_COMPLETED',
        'contact_share_transfer_completed', jsonb_build_object('contact_share_id', p_share_id, 'no_change', true),
        array['In-App'::text], 'Low', 'contact_share', p_share_id
      );
    end if;

    return '[]'::jsonb;
  end if;

  update public.ero_retained_contact_versions set is_current = false where retained_contact_id = v_retained_id and is_current;
  select coalesce(max(version_number), 0) + 1 into v_version_number from public.ero_retained_contact_versions where retained_contact_id = v_retained_id;

  insert into public.ero_retained_contact_versions (retained_contact_id, contact_share_id, version_number, transfer_kind, is_current)
  values (v_retained_id, p_share_id, v_version_number, v_share.transfer_kind, true)
  returning id into v_version_id;

  -- Full point-in-time snapshot: every category this retained record has
  -- EVER had approved (this transfer's categories, union every category
  -- already present in any prior version) -- not just this transfer's
  -- selection. Re-reads the just-updated current-state tables, so this
  -- is always the true current value whether or not THIS transfer
  -- touched a given field.
  select array(
    select distinct category_key from (
      select unnest(v_categories) as category_key
      union
      select vf.category_key from public.ero_retained_contact_version_fields vf
      join public.ero_retained_contact_versions v on v.id = vf.version_id
      where v.retained_contact_id = v_retained_id and v.id <> v_version_id
    ) x
  ) into v_ever_categories;

  select * into v_retained from public.ero_retained_contacts where id = v_retained_id;

  if 'IDENTIFYING_INFO' = any(v_ever_categories) then
    insert into public.ero_retained_contact_version_fields (version_id, category_key, field_name, value) values
      (v_version_id, 'IDENTIFYING_INFO', 'first_name', v_retained.first_name),
      (v_version_id, 'IDENTIFYING_INFO', 'middle_name', v_retained.middle_name),
      (v_version_id, 'IDENTIFYING_INFO', 'last_name', v_retained.last_name),
      (v_version_id, 'IDENTIFYING_INFO', 'suffix', v_retained.suffix),
      (v_version_id, 'IDENTIFYING_INFO', 'client_type', v_retained.client_type),
      (v_version_id, 'IDENTIFYING_INFO', 'business_name', v_retained.business_name),
      (v_version_id, 'IDENTIFYING_INFO', 'date_of_birth', v_retained.date_of_birth::text);
  end if;

  if 'PHONE' = any(v_ever_categories) then
    insert into public.ero_retained_contact_version_fields (version_id, category_key, field_name, value)
    select v_version_id, 'PHONE', 'phone_' || rn, phone_number || '|' || coalesce(phone_type, '') || '|' || is_primary::text
    from (select phone_number, phone_type, is_primary, row_number() over (order by display_order, id) as rn
          from public.ero_retained_contact_phones where retained_contact_id = v_retained_id) x;
  end if;

  if 'EMAIL' = any(v_ever_categories) then
    insert into public.ero_retained_contact_version_fields (version_id, category_key, field_name, value)
    select v_version_id, 'EMAIL', 'email_' || rn, email || '|' || coalesce(email_type, '') || '|' || is_primary::text
    from (select email, email_type, is_primary, row_number() over (order by display_order, id) as rn
          from public.ero_retained_contact_emails where retained_contact_id = v_retained_id) x;
  end if;

  if 'ADDRESS' = any(v_ever_categories) then
    insert into public.ero_retained_contact_version_fields (version_id, category_key, field_name, value)
    select v_version_id, 'ADDRESS', 'address_' || rn,
      coalesce(address_type, '') || '|' || coalesce(street, '') || '|' || coalesce(street2, '') || '|' || coalesce(city, '') || '|' || coalesce(state, '') || '|' || coalesce(zip, '') || '|' || is_primary::text
    from (select address_type, street, street2, city, state, zip, is_primary, row_number() over (order by display_order, id) as rn
          from public.ero_retained_contact_addresses where retained_contact_id = v_retained_id) x;
  end if;

  if 'SERVICE_INTERESTS' = any(v_ever_categories) then
    insert into public.ero_retained_contact_version_fields (version_id, category_key, field_name, value)
    select v_version_id, 'SERVICE_INTERESTS', 'service_' || rn, coalesce(service_category_name, '') || '|' || coalesce(service_name, '')
    from (select service_category_name, service_name, row_number() over (order by id) as rn
          from public.ero_retained_contact_service_interests where retained_contact_id = v_retained_id) x;
  end if;

  update public.ero_retained_contacts
    set current_version_id = v_version_id, last_updated_at = now()
  where id = v_retained_id;

  update public.contact_shares
    set status = 'transferred', resulting_version_id = v_version_id
  where id = p_share_id;

  insert into public.contact_share_actions (contact_share_id, action, actor_id)
  values (p_share_id, 'transfer_completed', auth.uid());

  if v_share.initiated_by_user_id is not null then
    perform public.create_notification(
      v_notify_workspace_id, v_share.initiated_by_user_id, 'CONTACT_SHARE_TRANSFER_COMPLETED',
      'contact_share_transfer_completed', jsonb_build_object('contact_share_id', p_share_id, 'version_id', v_version_id),
      array['In-App'::text], 'Medium', 'contact_share', p_share_id
    );
  end if;

  return v_paths;
end;
$function$;

revoke all on function public.execute_contact_share_transfer(uuid) from public, anon;
grant execute on function public.execute_contact_share_transfer(uuid) to authenticated;

-- ============================================================
-- RPC 5: mark_contact_document_transferred -- the ONLY thing that ever
-- sets transferred_at. Called after the external Storage copy is
-- confirmed to have succeeded (or found to already exist, on retry).
-- Idempotent: repeat calls on an already-confirmed transfer are no-ops.
-- ============================================================
create or replace function public.mark_contact_document_transferred(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_destination_workspace_id uuid;
begin
  select cs.destination_workspace_id into v_destination_workspace_id
  from public.contact_document_transfers cdt
  join public.contact_shares cs on cs.id = cdt.contact_share_id
  where cdt.id = p_transfer_id;

  if v_destination_workspace_id is null then
    raise exception 'document transfer not found';
  end if;

  if not public.has_permission(v_destination_workspace_id, 'clients.approve_share') then
    raise exception 'insufficient permissions to confirm this document transfer';
  end if;

  update public.contact_document_transfers
    set transferred_at = now()
  where id = p_transfer_id and transferred_at is null;
end;
$function$;

revoke all on function public.mark_contact_document_transferred(uuid) from public, anon;
grant execute on function public.mark_contact_document_transferred(uuid) to authenticated;

-- ============================================================
-- RPC 6: withdraw_contact_share -- initiator only, pending only.
-- ============================================================
create or replace function public.withdraw_contact_share(p_share_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_share public.contact_shares;
  v_initiator_workspace_id uuid;
  v_permission_key text;
begin
  select * into v_share from public.contact_shares where id = p_share_id;
  if v_share.id is null then
    raise exception 'contact share not found';
  end if;
  if v_share.status <> 'pending' then
    raise exception 'only a pending share can be withdrawn';
  end if;

  v_initiator_workspace_id := case when v_share.initiated_by = 'source' then v_share.source_workspace_id else v_share.destination_workspace_id end;
  v_permission_key := case when v_share.initiated_by = 'source' then 'clients.share' else 'clients.request_share_update' end;

  if not public.is_workspace_member(v_initiator_workspace_id) then
    raise exception 'insufficient permissions to withdraw this share';
  end if;
  if not public.has_permission(v_initiator_workspace_id, v_permission_key) then
    raise exception 'insufficient permissions to withdraw this share';
  end if;

  update public.contact_shares set status = 'withdrawn' where id = p_share_id;
  insert into public.contact_share_actions (contact_share_id, action, actor_id)
  values (p_share_id, 'withdraw', auth.uid());
end;
$function$;

revoke all on function public.withdraw_contact_share(uuid) from public, anon;
grant execute on function public.withdraw_contact_share(uuid) to authenticated;

-- ============================================================
-- RPC 7: resubmit_contact_share -- initiator only, corrections_requested
-- only, returns to pending.
-- ============================================================
create or replace function public.resubmit_contact_share(p_share_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_share public.contact_shares;
  v_initiator_workspace_id uuid;
  v_permission_key text;
begin
  select * into v_share from public.contact_shares where id = p_share_id;
  if v_share.id is null then
    raise exception 'contact share not found';
  end if;
  if v_share.status <> 'corrections_requested' then
    raise exception 'only a share with corrections requested can be resubmitted';
  end if;

  v_initiator_workspace_id := case when v_share.initiated_by = 'source' then v_share.source_workspace_id else v_share.destination_workspace_id end;
  v_permission_key := case when v_share.initiated_by = 'source' then 'clients.share' else 'clients.request_share_update' end;

  if not public.is_workspace_member(v_initiator_workspace_id) then
    raise exception 'insufficient permissions to resubmit this share';
  end if;
  if not public.has_permission(v_initiator_workspace_id, v_permission_key) then
    raise exception 'insufficient permissions to resubmit this share';
  end if;
  if not public.is_workspace_operational(v_initiator_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.contact_shares
    set status = 'pending', decision_notes = null, reviewed_by = null, reviewed_at = null, updated_at = now()
  where id = p_share_id;

  insert into public.contact_share_actions (contact_share_id, action, actor_id)
  values (p_share_id, 'resubmit', auth.uid());
end;
$function$;

revoke all on function public.resubmit_contact_share(uuid) from public, anon;
grant execute on function public.resubmit_contact_share(uuid) to authenticated;
