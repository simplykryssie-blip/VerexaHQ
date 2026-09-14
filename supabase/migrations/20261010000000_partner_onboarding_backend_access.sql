-- Phase 6J-1: backend access preparation for the (not-yet-built) partner-
-- facing onboarding application. No UI ships in this migration -- this is
-- the access layer Phase 6J-2/6J-3 will build against.
--
-- Four things, exactly:
--   A. (application data contract lives in TypeScript -- lib/partnerOnboardingApplication.ts,
--      not here; application_data stays a plain jsonb column, no schema change)
--   B. A narrow authorization helper + additive RLS so a connected partner
--      can see/upload against their OWN firm_connection's document_requests/
--      attachments/document_folders/document_request_item_statuses, and the
--      matching storage.objects policies for the client-documents bucket
--      upload path UploadZone.tsx actually uses.
--   C. A narrow, read-only agreement-token lookup RPC, derived entirely from
--      the caller's own authenticated workspace -- never from a client-
--      supplied firm_connection_id/onboarding_id.
--   D. A duplicate-task guard on submit_partner_onboarding_application,
--      mirroring the existing Phase 6I guard on _maybe_enter_review exactly.
--
-- Not touched: is_portal_user_for_entity (client-portal identity model,
-- left completely alone), the organizer/marketplace system, task/onboarding
-- statuses, task schema, partner_onboardings schema, signature_requests RLS
-- (the agreement flow goes through a dedicated lookup RPC instead of
-- broadening table access), fulfill_document_request_item's sibling actions
-- (mark_document_request_item_received / set_document_request_item_due_date
-- stay staff-only -- reviewing/marking-received is a parent action, not a
-- partner one).

-- ---------------------------------------------------------------------------
-- B1. Authorization helper
-- ---------------------------------------------------------------------------
-- True only when: the entity is a firm_connection, that connection's own
-- parent_workspace_id matches the workspace_id actually stored on the row
-- being checked (so a forged/mismatched workspace_id on an insert can't
-- piggyback on a real connection), and the calling user is an active member
-- of that connection's child_workspace_id specifically -- never "any
-- firm_connection", always the caller's own.
create or replace function public.is_partner_workspace_for_firm_connection(p_workspace_id uuid, p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p_entity_type = 'firm_connection' and exists (
    select 1 from public.firm_connections fc
    where fc.id = p_entity_id
      and fc.parent_workspace_id = p_workspace_id
      and public.is_workspace_member(fc.child_workspace_id)
  );
$function$;

revoke all on function public.is_partner_workspace_for_firm_connection(uuid, text, uuid) from public, anon;
grant execute on function public.is_partner_workspace_for_firm_connection(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- B2. Table RLS -- additive only, every existing clause preserved verbatim.
-- ---------------------------------------------------------------------------

alter policy document_requests_select on public.document_requests
  using (
    has_permission(workspace_id, 'documents.view'::text)
    or is_portal_user_for_entity(entity_type, entity_id)
    or public.is_partner_workspace_for_firm_connection(workspace_id, entity_type, entity_id)
  );

alter policy document_folders_select on public.document_folders
  using (
    has_permission(workspace_id, 'documents.view'::text)
    or is_portal_user_for_entity(entity_type, entity_id)
    or public.is_partner_workspace_for_firm_connection(workspace_id, entity_type, entity_id)
  );

alter policy document_request_item_statuses_select on public.document_request_item_statuses
  using (
    (exists (
      select 1 from document_requests r
      where r.id = document_request_item_statuses.document_request_id
        and has_permission(r.workspace_id, 'documents.view'::text)
    ))
    or (exists (
      select 1 from document_requests r
      where r.id = document_request_item_statuses.document_request_id
        and is_portal_user_for_entity(r.entity_type, r.entity_id)
    ))
    or (exists (
      select 1 from document_requests r
      where r.id = document_request_item_statuses.document_request_id
        and public.is_partner_workspace_for_firm_connection(r.workspace_id, r.entity_type, r.entity_id)
    ))
  );

alter policy client_documents_select on public.attachments
  using (
    has_permission(workspace_id, 'documents.view'::text)
    or ((visibility = 'client_visible'::text) and (is_archived = false) and is_portal_user_for_entity(entity_type, entity_id))
    or (
      (visibility = 'client_visible'::text) and (is_archived = false) and (
        ((entity_type = 'engagement'::text) and has_pending_engagement_share_access(entity_id))
        or ((entity_type = 'client'::text) and (exists (
          select 1 from engagements e where e.client_id = attachments.entity_id and has_pending_engagement_share_access(e.id)
        )))
      )
    )
    or public.is_partner_workspace_for_firm_connection(workspace_id, entity_type, entity_id)
  );

alter policy client_documents_insert on public.attachments
  with check (
    (has_permission(workspace_id, 'documents.upload'::text) and (uploaded_by = (select auth.uid())))
    or ((visibility = 'client_visible'::text) and (uploaded_by = (select auth.uid())) and is_portal_user_for_entity(entity_type, entity_id))
    or ((uploaded_by = (select auth.uid())) and public.is_partner_workspace_for_firm_connection(workspace_id, entity_type, entity_id))
  );

-- ---------------------------------------------------------------------------
-- B3. Storage RLS for the client-documents bucket -- mirrors the existing
-- client_documents_storage_portal_* policies exactly, for the same reason:
-- UploadZone.tsx writes to Storage directly (not through an RPC), so the
-- table-level fix above is necessary but not sufficient for upload to work.
-- Path shape is `${workspaceId}/${entityId}/...` (foldername()[1] / [2]) --
-- unchanged, matching every other policy on this bucket.
-- ---------------------------------------------------------------------------

create policy client_documents_storage_firm_connection_select on storage.objects
  for select to public
  using (
    bucket_id = 'client-documents'
    and public.is_partner_workspace_for_firm_connection(
      ((storage.foldername(name))[1])::uuid, 'firm_connection', ((storage.foldername(name))[2])::uuid
    )
  );

create policy client_documents_storage_firm_connection_insert on storage.objects
  for insert to public
  with check (
    bucket_id = 'client-documents'
    and public.is_partner_workspace_for_firm_connection(
      ((storage.foldername(name))[1])::uuid, 'firm_connection', ((storage.foldername(name))[2])::uuid
    )
  );

-- ---------------------------------------------------------------------------
-- B4. fulfill_document_request_item -- the one existing document RPC a
-- partner actually needs to call to link an uploaded file to a requested
-- checklist item (RequestsPanel's "fulfill" action). Its sibling actions
-- (mark received without an attachment, set a due date) stay parent/staff-
-- only -- deliberately not extended here, since reviewing a submission is a
-- parent action, not something a partner does to their own request.
-- ---------------------------------------------------------------------------
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

  update public.document_request_item_statuses
  set status = 'uploaded', fulfilled_by_attachment_id = p_attachment_id, updated_at = now()
  where id = p_item_status_id;

  -- Best-effort: file into the matching folder if this item has a default
  -- folder and that folder actually exists for this entity (e.g. a client-
  -- level request has no auto-created folders, or an older engagement
  -- predates the folder template system) -- leave folder_id null otherwise.
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

-- ---------------------------------------------------------------------------
-- C. Agreement-token lookup -- read-only, derives everything from the
-- caller's own authenticated workspace membership (is_workspace_member),
-- never from a client-supplied firm_connection_id/onboarding_id. Returns
-- only the bare access_token a partner needs to build their own
-- /sign/[token] link -- never a raw signature_request_signers row, never
-- another signer's token, never anything for a different onboarding.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_partner_onboarding_agreement_token(p_workspace_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_signature_request_id uuid;
  v_token uuid;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  select po.agreement_signature_request_id into v_signature_request_id
  from public.partner_onboardings po
  join public.firm_connections fc on fc.id = po.firm_connection_id
  where fc.child_workspace_id = p_workspace_id
  order by po.created_at desc
  limit 1;

  if v_signature_request_id is null then
    return null;
  end if;

  select s.access_token into v_token
  from public.signature_request_signers s
  where s.signature_request_id = v_signature_request_id
  order by s.sign_order
  limit 1;

  return v_token;
end;
$function$;

revoke all on function public.get_my_partner_onboarding_agreement_token(uuid) from public, anon;
grant execute on function public.get_my_partner_onboarding_agreement_token(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- D. Duplicate application-task guard -- identical philosophy to Phase 6I's
-- existing guard in _maybe_enter_review for "Approve or reject partner
-- onboarding": before inserting, check whether an open one already exists
-- for this connection. Safe across reapplication for the same reason 6I's
-- guard is safe -- partner_onboardings_active_per_connection guarantees at
-- most one live onboarding per connection, so this predicate can only ever
-- match THIS onboarding's own leftover task, never a different one's (a
-- prior onboarding's tasks were already completed synchronously by Phase
-- 6I's approve/reject/withdraw handling by the time a new one could exist).
-- No column added, no new relationship, no retroactive sweep.
-- ---------------------------------------------------------------------------
create or replace function public.submit_partner_onboarding_application(p_workspace_id uuid, p_onboarding_id uuid, p_application_data jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_onboarding record;
begin
  select po.* into v_onboarding
  from public.partner_onboardings po
  join public.firm_connections fc on fc.id = po.firm_connection_id
  where po.id = p_onboarding_id and fc.child_workspace_id = p_workspace_id;

  if v_onboarding.id is null then
    raise exception 'onboarding record not found';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'insufficient permissions to submit this application';
  end if;
  if v_onboarding.status not in ('pending', 'in_progress') then
    raise exception 'this application is no longer open for edits';
  end if;

  update public.partner_onboardings
  set application_data = p_application_data,
      application_submitted_at = now(),
      status = case when status = 'pending' then 'in_progress' else status end
  where id = p_onboarding_id;

  if not exists (
    select 1 from public.tasks
    where firm_connection_id = v_onboarding.firm_connection_id
      and title = 'Review new partner application'
      and status in ('pending', 'in_progress', 'blocked')
  ) then
    insert into public.tasks (workspace_id, firm_connection_id, title, description, priority, assigned_staff_id, visibility)
    values (
      v_onboarding.workspace_id, v_onboarding.firm_connection_id,
      'Review new partner application',
      'A partner application was submitted and is ready for review once all onboarding requirements are complete.',
      'medium', public._resolve_onboarding_default_reviewer(v_onboarding.workspace_id, v_onboarding.firm_connection_id), 'internal'
    );
  end if;

  perform public._maybe_enter_review(p_onboarding_id);
end;
$function$;
