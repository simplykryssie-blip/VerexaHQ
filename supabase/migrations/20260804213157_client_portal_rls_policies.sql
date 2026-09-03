-- Generic "does this polymorphic entity belong to a client I represent"
-- check, reused by every portal policy below instead of repeating the
-- client-vs-engagement branch in each one.
create or replace function public.is_portal_user_for_entity(p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when p_entity_type = 'client' then public.is_portal_user(p_entity_id)
    when p_entity_type = 'engagement' then exists (
      select 1 from public.engagements e where e.id = p_entity_id and public.is_portal_user(e.client_id)
    )
    else false
  end;
$$;

-- Same check for a bare id with no entity_type alongside it (storage paths
-- only carry the id, not which table it came from).
create or replace function public.is_portal_accessible_entity_id(p_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_portal_user(p_entity_id)
    or exists (select 1 from public.engagements e where e.id = p_entity_id and public.is_portal_user(e.client_id));
$$;

-- Documents: client-visible, non-archived files on their own client or
-- their own engagements; upload stays scoped the same way.
create policy attachments_portal_select on public.attachments
  for select using (visibility = 'client_visible' and is_archived = false and public.is_portal_user_for_entity(entity_type, entity_id));
create policy attachments_portal_insert on public.attachments
  for insert with check (
    visibility = 'client_visible' and uploaded_by = auth.uid() and public.is_portal_user_for_entity(entity_type, entity_id)
  );

create policy client_documents_storage_portal_select on storage.objects
  for select using (bucket_id = 'client-documents' and public.is_portal_accessible_entity_id(((storage.foldername(name))[2])::uuid));
create policy client_documents_storage_portal_insert on storage.objects
  for insert with check (bucket_id = 'client-documents' and public.is_portal_accessible_entity_id(((storage.foldername(name))[2])::uuid));

-- Document requests: read + the item statuses under them.
create policy document_requests_portal_select on public.document_requests
  for select using (public.is_portal_user_for_entity(entity_type, entity_id));
create policy document_request_item_statuses_portal_select on public.document_request_item_statuses
  for select using (exists (
    select 1 from public.document_requests r where r.id = document_request_item_statuses.document_request_id
    and public.is_portal_user_for_entity(r.entity_type, r.entity_id)
  ));

-- Signature requests: read the request + signer rows tied to their own
-- documents. Signing/declining goes through the RPCs below (which now
-- accept a portal caller), not a raw UPDATE policy.
create policy signature_requests_portal_select on public.signature_requests
  for select using (exists (
    select 1 from public.attachments a where a.id = signature_requests.attachment_id
    and public.is_portal_user_for_entity(a.entity_type, a.entity_id)
  ));
create policy signature_request_signers_portal_select on public.signature_request_signers
  for select using (exists (
    select 1 from public.signature_requests r
    join public.attachments a on a.id = r.attachment_id
    where r.id = signature_request_signers.signature_request_id
    and public.is_portal_user_for_entity(a.entity_type, a.entity_id)
  ));

-- Messages: portal can read their own thread and post to it (never
-- internal-only messages, which stay staff-only).
create policy message_threads_portal_select on public.message_threads
  for select using (public.is_portal_user_for_entity(entity_type, entity_id));
create policy message_threads_portal_insert on public.message_threads
  for insert with check (entity_type = 'client' and public.is_portal_user(entity_id) and created_by = auth.uid());
create policy messages_portal_select on public.messages
  for select using (
    is_internal = false
    and exists (select 1 from public.message_threads t where t.id = messages.thread_id and public.is_portal_user_for_entity(t.entity_type, t.entity_id))
  );
create policy messages_portal_insert on public.messages
  for insert with check (
    sender_type = 'client' and is_internal = false and sender_id = auth.uid()
    and exists (select 1 from public.message_threads t where t.id = messages.thread_id and public.is_portal_user_for_entity(t.entity_type, t.entity_id))
  );

-- Billing: read-only. Payment creation continues through the existing
-- Stripe checkout route, not a direct client-side insert.
create policy invoices_portal_select on public.invoices for select using (public.is_portal_user(client_id));
create policy quotes_portal_select on public.quotes for select using (public.is_portal_user(client_id));
create policy payments_portal_select on public.payments for select using (public.is_portal_user(client_id));
create policy client_ledger_portal_select on public.client_ledger for select using (public.is_portal_user(client_id));

-- Timeline + IRS notices: read-only visibility into their own history.
create policy activity_log_portal_select on public.activity_log
  for select using (public.is_portal_user_for_entity(entity_type, entity_id));
create policy irs_notices_portal_select on public.irs_notices
  for select using (public.is_portal_user_for_entity(entity_type, entity_id));

-- Tax organizers: the actual Portal Organizer API -- a client can see and
-- fill in their own organizer response, but only staff can mark it
-- "reviewed" (enforced by submit_organizer_response only ever setting
-- 'submitted', and no policy here permits WHERE status = 'reviewed').
create policy organizer_responses_portal_select on public.organizer_responses
  for select using (public.is_portal_user(client_id));
create policy organizer_responses_portal_insert on public.organizer_responses
  for insert with check (public.is_portal_user(client_id) and status in ('not_started','in_progress'));
create policy organizer_responses_portal_update on public.organizer_responses
  for update using (public.is_portal_user(client_id) and status in ('not_started','in_progress'));
create policy organizer_response_answers_portal_select on public.organizer_response_answers
  for select using (exists (
    select 1 from public.organizer_responses r where r.id = organizer_response_answers.organizer_response_id and public.is_portal_user(r.client_id)
  ));
create policy organizer_response_answers_portal_insert on public.organizer_response_answers
  for insert with check (exists (
    select 1 from public.organizer_responses r where r.id = organizer_response_answers.organizer_response_id
    and public.is_portal_user(r.client_id) and r.status in ('not_started','in_progress')
  ));
create policy organizer_response_answers_portal_update on public.organizer_response_answers
  for update using (exists (
    select 1 from public.organizer_responses r where r.id = organizer_response_answers.organizer_response_id
    and public.is_portal_user(r.client_id) and r.status in ('not_started','in_progress')
  ));

-- Extend the three existing signing/fulfillment RPCs to also accept a
-- portal caller (matched by signer email, scoped to their own client's
-- documents) instead of writing parallel portal_* copies.
create or replace function public.record_signature(
  p_signer_id uuid, p_signature_type text, p_signature_image_path text default null, p_typed_name text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_request_id uuid;
  v_workspace_id uuid;
  v_attachment_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_signer_email text;
  v_caller_email text;
  v_pending_count int;
begin
  select s.signature_request_id, r.workspace_id, r.attachment_id, a.entity_type, a.entity_id, s.signer_email
  into v_request_id, v_workspace_id, v_attachment_id, v_entity_type, v_entity_id, v_signer_email
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  join public.attachments a on a.id = r.attachment_id
  where s.id = p_signer_id;

  if v_request_id is null then
    raise exception 'signer not found';
  end if;

  select email into v_caller_email from auth.users where id = auth.uid();

  if not (
    public.has_permission(v_workspace_id, 'signatures.request')
    or (
      v_signer_email is not null and lower(v_caller_email) = lower(v_signer_email)
      and public.is_portal_user_for_entity(v_entity_type, v_entity_id)
    )
  ) then
    raise exception 'insufficient permissions';
  end if;

  update public.signature_request_signers
  set status = 'signed', signature_type = p_signature_type, signature_image_path = p_signature_image_path,
      typed_name = p_typed_name, signed_at = now()
  where id = p_signer_id;

  select count(*) into v_pending_count from public.signature_request_signers
  where signature_request_id = v_request_id and status = 'pending';

  if v_pending_count = 0 then
    update public.signature_requests set status = 'completed', updated_at = now() where id = v_request_id;
    update public.attachments set is_locked = true where id = v_attachment_id;
  end if;
end;
$$;

create or replace function public.decline_signature(p_signer_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_request_id uuid;
  v_workspace_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_signer_email text;
  v_caller_email text;
begin
  select s.signature_request_id, r.workspace_id, a.entity_type, a.entity_id, s.signer_email
  into v_request_id, v_workspace_id, v_entity_type, v_entity_id, v_signer_email
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  join public.attachments a on a.id = r.attachment_id
  where s.id = p_signer_id;

  if v_request_id is null then
    raise exception 'signer not found';
  end if;

  select email into v_caller_email from auth.users where id = auth.uid();

  if not (
    public.has_permission(v_workspace_id, 'signatures.request')
    or (
      v_signer_email is not null and lower(v_caller_email) = lower(v_signer_email)
      and public.is_portal_user_for_entity(v_entity_type, v_entity_id)
    )
  ) then
    raise exception 'insufficient permissions';
  end if;

  update public.signature_request_signers
  set status = 'declined', declined_at = now(), decline_reason = p_reason
  where id = p_signer_id;

  update public.signature_requests set status = 'declined', updated_at = now() where id = v_request_id;
end;
$$;

create or replace function public.fulfill_document_request_item(p_item_status_id uuid, p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
  v_entity_type text;
  v_entity_id uuid;
begin
  select r.workspace_id, r.entity_type, r.entity_id into v_workspace_id, v_entity_type, v_entity_id
  from public.document_request_item_statuses s
  join public.document_requests r on r.id = s.document_request_id
  where s.id = p_item_status_id;

  if v_workspace_id is null then
    raise exception 'request item not found';
  end if;
  if not (
    public.has_permission(v_workspace_id, 'documents.upload')
    or public.is_portal_user_for_entity(v_entity_type, v_entity_id)
  ) then
    raise exception 'insufficient permissions';
  end if;

  update public.document_request_item_statuses
  set status = 'uploaded', fulfilled_by_attachment_id = p_attachment_id, updated_at = now()
  where id = p_item_status_id;
end;
$$;

-- submit_organizer_response: allow the portal user themselves to submit,
-- not just staff.
create or replace function public.submit_organizer_response(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
  v_client_id uuid;
begin
  select workspace_id, client_id into v_workspace_id, v_client_id from public.organizer_responses where id = p_response_id;
  if v_workspace_id is null then
    raise exception 'organizer response not found';
  end if;
  if not (public.has_permission(v_workspace_id, 'engagements.manage') or public.is_portal_user(v_client_id)) then
    raise exception 'insufficient permissions';
  end if;

  update public.organizer_responses
  set status = 'submitted', submitted_at = now(), updated_at = now()
  where id = p_response_id;

  insert into public.activity_log (workspace_id, entity_type, entity_id, activity_type, description)
  values (v_workspace_id, 'client', v_client_id, 'organizer_submitted', 'Tax organizer submitted');
end;
$$;
revoke execute on function public.submit_organizer_response(uuid) from public, anon;
