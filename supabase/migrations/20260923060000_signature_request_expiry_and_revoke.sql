-- Signing links (signature_request_signers.access_token) never expired and
-- had no revoke path (security finding 6291ffeb). Adds an optional,
-- opt-in expiry and a staff-facing cancel path. expires_at is nullable
-- with no default, so every existing and future signature request keeps
-- working exactly as before unless staff explicitly sets an expiry or
-- cancels the request -- this is additive, not a behavior change.

alter table public.signature_request_signers
  add column if not exists expires_at timestamptz;

-- Public token RPCs now also honor a cancelled request or an expired signer.
-- get_signature_request_by_token's RETURN TABLE shape is changing (adds
-- expires_at), and create-or-replace only replaces a function in place when
-- both its arguments AND return type are unchanged -- drop the old
-- signature first so this doesn't silently leave two overloads live (the
-- exact bug this session already hit once with set_firm_tax_profile).
drop function if exists public.get_signature_request_by_token(uuid);

create or replace function public.get_signature_request_by_token(p_token uuid)
 returns table(signer_id uuid, signer_name text, signer_status text, signed_at timestamptz, declined_at timestamptz, decline_reason text, request_title text, request_status text, attachment_id uuid, attachment_file_name text, attachment_mime_type text, workspace_id uuid, workspace_name text, expires_at timestamptz)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  return query
  select s.id, s.signer_name, s.status, s.signed_at, s.declined_at, s.decline_reason,
         r.title, r.status, a.id, a.file_name, a.mime_type, r.workspace_id, w.name, s.expires_at
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  join public.attachments a on a.id = r.attachment_id
  join public.workspaces w on w.id = r.workspace_id
  where s.access_token = p_token;
end;
$function$;

create or replace function public.record_signature_by_token(p_token uuid, p_signature_type text, p_typed_name text default null, p_signature_image_path text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_signer_id uuid;
  v_request_id uuid;
  v_attachment_id uuid;
  v_request_status text;
  v_expires_at timestamptz;
  v_pending_count int;
begin
  if p_typed_name is null or btrim(p_typed_name) = '' then
    raise exception 'A typed signature is required';
  end if;
  if p_signature_image_path is null or btrim(p_signature_image_path) = '' then
    raise exception 'A drawn signature is required';
  end if;

  select s.id, s.signature_request_id, r.attachment_id, r.status, s.expires_at
  into v_signer_id, v_request_id, v_attachment_id, v_request_status, v_expires_at
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  where s.access_token = p_token;

  if v_signer_id is null then
    raise exception 'invalid signing link';
  end if;

  if v_request_status = 'cancelled' then
    raise exception 'this signing link has been revoked';
  end if;

  if v_expires_at is not null and now() > v_expires_at then
    raise exception 'this signing link has expired';
  end if;

  update public.signature_request_signers
  set status = 'signed', signature_type = 'drawn', signature_image_path = p_signature_image_path,
      typed_name = btrim(p_typed_name), signed_at = now()
  where id = v_signer_id and status = 'pending';

  if not found then
    raise exception 'this signing request is no longer pending';
  end if;

  select count(*) into v_pending_count from public.signature_request_signers
  where signature_request_id = v_request_id and status = 'pending';

  if v_pending_count = 0 then
    update public.signature_requests set status = 'completed', updated_at = now() where id = v_request_id;
    update public.attachments set is_locked = true where id = v_attachment_id;
  end if;
end;
$function$;

create or replace function public.decline_signature_by_token(p_token uuid, p_reason text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_signer_id uuid;
  v_request_id uuid;
  v_request_status text;
  v_expires_at timestamptz;
begin
  select s.id, s.signature_request_id, r.status, s.expires_at
  into v_signer_id, v_request_id, v_request_status, v_expires_at
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  where s.access_token = p_token;

  if v_signer_id is null then
    raise exception 'invalid signing link';
  end if;

  if v_request_status = 'cancelled' then
    raise exception 'this signing link has been revoked';
  end if;

  if v_expires_at is not null and now() > v_expires_at then
    raise exception 'this signing link has expired';
  end if;

  update public.signature_request_signers
  set status = 'declined', declined_at = now(), decline_reason = p_reason
  where id = v_signer_id and status = 'pending';

  if not found then
    raise exception 'this signing request is no longer pending';
  end if;

  update public.signature_requests set status = 'declined', updated_at = now() where id = v_request_id;
end;
$function$;

-- In-app (authenticated staff/portal) record/decline: also honor a
-- cancelled request so it can't be recorded against after a revoke.

create or replace function public.record_signature(p_signer_id uuid, p_signature_type text, p_signature_image_path text default null, p_typed_name text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_request_id uuid;
  v_workspace_id uuid;
  v_attachment_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_signer_email text;
  v_caller_email text;
  v_pending_count int;
  v_is_staff boolean;
  v_request_status text;
begin
  if p_typed_name is null or btrim(p_typed_name) = '' then
    raise exception 'A typed signature is required';
  end if;
  if p_signature_type = 'drawn' and (p_signature_image_path is null or btrim(p_signature_image_path) = '') then
    raise exception 'A drawn signature is required';
  end if;

  select s.signature_request_id, r.workspace_id, r.attachment_id, a.entity_type, a.entity_id, s.signer_email, r.status
  into v_request_id, v_workspace_id, v_attachment_id, v_entity_type, v_entity_id, v_signer_email, v_request_status
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  join public.attachments a on a.id = r.attachment_id
  where s.id = p_signer_id;

  if v_request_id is null then
    raise exception 'signer not found';
  end if;

  if v_request_status = 'cancelled' then
    raise exception 'this signature request has been revoked';
  end if;

  select email into v_caller_email from auth.users where id = auth.uid();

  v_is_staff := public.has_permission(v_workspace_id, 'signatures.request');

  if not (
    v_is_staff
    or (
      v_signer_email is not null and lower(v_caller_email) = lower(v_signer_email)
      and public.is_portal_user_for_entity(v_entity_type, v_entity_id)
    )
  ) then
    raise exception 'insufficient permissions';
  end if;

  if v_is_staff and not exists (
    select 1 from public.signature_request_signers where id = p_signer_id and attested_by is not null
  ) then
    raise exception 'Please confirm you are present and have verified this signer''s identity before recording their signature.';
  end if;

  update public.signature_request_signers
  set status = 'signed', signature_type = p_signature_type, signature_image_path = p_signature_image_path,
      typed_name = btrim(p_typed_name), signed_at = now()
  where id = p_signer_id and status = 'pending';

  if not found then
    raise exception 'this signing request is no longer pending';
  end if;

  select count(*) into v_pending_count from public.signature_request_signers
  where signature_request_id = v_request_id and status = 'pending';

  if v_pending_count = 0 then
    update public.signature_requests set status = 'completed', updated_at = now() where id = v_request_id;
    update public.attachments set is_locked = true where id = v_attachment_id;
  end if;
end;
$function$;

create or replace function public.decline_signature(p_signer_id uuid, p_reason text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_request_id uuid;
  v_workspace_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_signer_email text;
  v_caller_email text;
  v_request_status text;
begin
  select s.signature_request_id, r.workspace_id, a.entity_type, a.entity_id, s.signer_email, r.status
  into v_request_id, v_workspace_id, v_entity_type, v_entity_id, v_signer_email, v_request_status
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  join public.attachments a on a.id = r.attachment_id
  where s.id = p_signer_id;

  if v_request_id is null then
    raise exception 'signer not found';
  end if;

  if v_request_status = 'cancelled' then
    raise exception 'this signature request has been revoked';
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
  where id = p_signer_id and status = 'pending';

  if not found then
    raise exception 'this signing request is no longer pending';
  end if;

  update public.signature_requests set status = 'declined', updated_at = now() where id = v_request_id;
end;
$function$;

-- New staff-facing controls: revoke a still-pending request outright, or
-- set/clear an expiry on its still-pending signers.

create or replace function public.cancel_signature_request(p_signature_request_id uuid)
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

  update public.signature_requests
  set status = 'cancelled', updated_at = now()
  where id = p_signature_request_id and status = 'pending';

  if not found then
    raise exception 'this signature request is no longer pending';
  end if;
end;
$function$;

create or replace function public.set_signature_request_expiry(p_signature_request_id uuid, p_expires_at timestamptz)
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

  update public.signature_request_signers
  set expires_at = p_expires_at
  where signature_request_id = p_signature_request_id and status = 'pending';
end;
$function$;
