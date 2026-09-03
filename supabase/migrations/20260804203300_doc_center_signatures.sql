
-- No signature backend existed anywhere in this schema before this
-- migration. This models in-house signature request tracking and
-- capture (typed/drawn signature stored as our own record) -- it is not
-- integrated with a third-party e-sign provider (DocuSign etc., which
-- would need API credentials this environment doesn't have), and there is
-- no public signer-facing link since that requires the Client Portal,
-- which is explicitly out of scope for this pass.
create table public.signature_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  attachment_id uuid not null references public.attachments(id) on delete cascade,
  title text not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'declined', 'cancelled')),
  due_date date,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.signature_request_signers (
  id uuid primary key default gen_random_uuid(),
  signature_request_id uuid not null references public.signature_requests(id) on delete cascade,
  signer_name text not null,
  signer_email text,
  sign_order integer not null default 1,
  status text not null default 'pending' check (status in ('pending', 'signed', 'declined')),
  signature_type text check (signature_type in ('drawn', 'typed')),
  signature_image_path text,
  typed_name text,
  signed_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index idx_signature_requests_attachment on public.signature_requests (attachment_id);
create index idx_signature_requests_workspace on public.signature_requests (workspace_id);
create index idx_signature_request_signers_request on public.signature_request_signers (signature_request_id);

alter table public.signature_requests enable row level security;
alter table public.signature_request_signers enable row level security;

create policy signature_requests_select on public.signature_requests
  for select using (has_permission(workspace_id, 'signatures.view'));
create policy signature_requests_insert on public.signature_requests
  for insert with check (has_permission(workspace_id, 'signatures.request'));
create policy signature_requests_update on public.signature_requests
  for update using (has_permission(workspace_id, 'signatures.request'));
create policy signature_requests_delete on public.signature_requests
  for delete using (has_permission(workspace_id, 'signatures.request'));

create policy signature_request_signers_select on public.signature_request_signers
  for select using (exists (
    select 1 from public.signature_requests r where r.id = signature_request_signers.signature_request_id
      and has_permission(r.workspace_id, 'signatures.view')
  ));
create policy signature_request_signers_insert on public.signature_request_signers
  for insert with check (exists (
    select 1 from public.signature_requests r where r.id = signature_request_signers.signature_request_id
      and has_permission(r.workspace_id, 'signatures.request')
  ));
create policy signature_request_signers_update on public.signature_request_signers
  for update using (exists (
    select 1 from public.signature_requests r where r.id = signature_request_signers.signature_request_id
      and has_permission(r.workspace_id, 'signatures.request')
  ));
create policy signature_request_signers_delete on public.signature_request_signers
  for delete using (exists (
    select 1 from public.signature_requests r where r.id = signature_request_signers.signature_request_id
      and has_permission(r.workspace_id, 'signatures.request')
  ));

create trigger set_updated_at before update on public.signature_requests
  for each row execute function public.set_updated_at();
create trigger audit_trigger after insert or update or delete on public.signature_requests
  for each row execute function public.audit_trigger_fn();
create trigger audit_trigger after insert or update or delete on public.signature_request_signers
  for each row execute function public.audit_trigger_fn();

-- Marks a signer as signed (staff-captured, in-person/typed -- not a
-- public self-service link) and completes + locks the parent request's
-- document once every signer has signed.
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
  v_pending_count int;
begin
  select s.signature_request_id, r.workspace_id, r.attachment_id
  into v_request_id, v_workspace_id, v_attachment_id
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  where s.id = p_signer_id;

  if v_request_id is null then
    raise exception 'signer not found';
  end if;
  if not public.has_permission(v_workspace_id, 'signatures.request') then
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

revoke execute on function public.record_signature(uuid, text, text, text) from public, anon;

create or replace function public.decline_signature(p_signer_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_request_id uuid;
  v_workspace_id uuid;
begin
  select s.signature_request_id, r.workspace_id into v_request_id, v_workspace_id
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  where s.id = p_signer_id;

  if v_request_id is null then
    raise exception 'signer not found';
  end if;
  if not public.has_permission(v_workspace_id, 'signatures.request') then
    raise exception 'insufficient permissions';
  end if;

  update public.signature_request_signers
  set status = 'declined', declined_at = now(), decline_reason = p_reason
  where id = p_signer_id;

  update public.signature_requests set status = 'declined', updated_at = now() where id = v_request_id;
end;
$$;

revoke execute on function public.decline_signature(uuid, text) from public, anon;
