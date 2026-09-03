
-- Public, unauthenticated signing links for external signers with no portal account.
-- Token is unguessable (uuid) and is the sole authorization for the three
-- functions below -- they are SECURITY DEFINER and granted to anon/authenticated,
-- bypassing normal has_permission/is_portal_user_for_entity checks by design,
-- exactly like a magic link. No RLS policy changes needed since callers never
-- touch the tables directly, only through these functions.

alter table public.signature_request_signers
  add column if not exists access_token uuid not null default gen_random_uuid();

create unique index if not exists signature_request_signers_access_token_key
  on public.signature_request_signers (access_token);

create or replace function public.get_signature_request_by_token(p_token uuid)
returns table (
  signer_id uuid,
  signer_name text,
  signer_status text,
  signed_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  request_title text,
  request_status text,
  attachment_id uuid,
  attachment_file_name text,
  attachment_mime_type text,
  workspace_id uuid,
  workspace_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select s.id, s.signer_name, s.status, s.signed_at, s.declined_at, s.decline_reason,
         r.title, r.status, a.id, a.file_name, a.mime_type, r.workspace_id, w.name
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  join public.attachments a on a.id = r.attachment_id
  join public.workspaces w on w.id = r.workspace_id
  where s.access_token = p_token;
end;
$$;

revoke all on function public.get_signature_request_by_token(uuid) from public;
grant execute on function public.get_signature_request_by_token(uuid) to anon, authenticated;

create or replace function public.record_signature_by_token(
  p_token uuid,
  p_signature_type text,
  p_typed_name text default null,
  p_signature_image_path text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signer_id uuid;
  v_request_id uuid;
  v_attachment_id uuid;
  v_pending_count int;
begin
  select s.id, s.signature_request_id, r.attachment_id
  into v_signer_id, v_request_id, v_attachment_id
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  where s.access_token = p_token;

  if v_signer_id is null then
    raise exception 'invalid signing link';
  end if;

  update public.signature_request_signers
  set status = 'signed', signature_type = p_signature_type, signature_image_path = p_signature_image_path,
      typed_name = p_typed_name, signed_at = now()
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
$$;

revoke all on function public.record_signature_by_token(uuid, text, text, text) from public;
grant execute on function public.record_signature_by_token(uuid, text, text, text) to anon, authenticated;

create or replace function public.decline_signature_by_token(p_token uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signer_id uuid;
  v_request_id uuid;
begin
  select s.id, s.signature_request_id into v_signer_id, v_request_id
  from public.signature_request_signers s
  where s.access_token = p_token;

  if v_signer_id is null then
    raise exception 'invalid signing link';
  end if;

  update public.signature_request_signers
  set status = 'declined', declined_at = now(), decline_reason = p_reason
  where id = v_signer_id and status = 'pending';

  if not found then
    raise exception 'this signing request is no longer pending';
  end if;

  update public.signature_requests set status = 'declined', updated_at = now() where id = v_request_id;
end;
$$;

revoke all on function public.decline_signature_by_token(uuid, text) from public;
grant execute on function public.decline_signature_by_token(uuid, text) to anon, authenticated;
