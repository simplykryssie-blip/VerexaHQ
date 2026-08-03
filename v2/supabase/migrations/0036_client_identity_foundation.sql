-- Revision Sprint -- Phase 1: Client & Identity Foundation
--
-- Clients did not exist in this backend yet (Phase 1 "Contacts" was never
-- built), so this is new construction, not a refactor -- built directly to
-- the finalized design rather than a Contacts table that would need
-- replacing. Clients are universal and module-agnostic: nothing here
-- assumes Tax specifically, so Bookkeeping/Payroll/Business
-- Formation/Advisory can attach to the same client later without a
-- redesign. Clients are strictly separate from workspace_users (Phase 0) --
-- a client is never promoted to a workspace user and vice versa; there is
-- no shared table or FK between them.
--
-- A client belongs to exactly one workspace (its owning PTIN or ERO Office;
-- Service Bureaus never own clients directly -- nothing stops it at the
-- schema level today since that''s a business rule enforced by which
-- workspaces actually create clients, not a capability the schema needs to
-- forbid).

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'client_identity_vault_key') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'base64'),
      'client_identity_vault_key',
      'Symmetric passphrase for encrypting client SSN/EIN/ITIN at rest (pgp_sym_encrypt/decrypt). Separate from firm_tax_profile_key so client PII and firm credentials never share a key.'
    );
  end if;
end $$;

create or replace function public.encrypt_client_secret(p_plaintext text)
returns bytea
language sql
security definer
set search_path = public, extensions
as $$
  select case when p_plaintext is null or btrim(p_plaintext) = '' then null
    else pgp_sym_encrypt(p_plaintext, (select decrypted_secret from vault.decrypted_secrets where name = 'client_identity_vault_key'))
  end;
$$;

create or replace function public.decrypt_client_secret(p_ciphertext bytea)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select case when p_ciphertext is null then null
    else pgp_sym_decrypt(p_ciphertext, (select decrypted_secret from vault.decrypted_secrets where name = 'client_identity_vault_key'))
  end;
$$;

revoke execute on function public.encrypt_client_secret(text) from public, anon, authenticated;
revoke execute on function public.decrypt_client_secret(bytea) from public, anon, authenticated;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_type text not null default 'individual' check (client_type in ('individual', 'business', 'trust', 'estate', 'organization')),
  lifecycle_status text not null default 'lead'
    check (lifecycle_status in ('lead', 'consult_scheduled', 'proposal_sent', 'active', 'inactive', 'archived')),
  first_name text,
  last_name text,
  business_name text,
  date_of_birth date,
  primary_email citext,
  primary_phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text not null default 'US',
  ssn_encrypted bytea,
  ssn_last4 text,
  ssn_hash text,
  ein_encrypted bytea,
  ein_last4 text,
  ein_hash text,
  itin_encrypted bytea,
  itin_last4 text,
  itin_hash text,
  normalized_email citext,
  normalized_phone text,
  has_portal_access boolean not null default false,
  tags text[] not null default '{}',
  custom_fields jsonb not null default '{}'::jsonb,
  notes text,
  merged_into_client_id uuid references public.clients(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_type = 'individual' or business_name is not null),
  check (client_type <> 'individual' or first_name is not null or last_name is not null)
);
comment on table public.clients is 'Universal client record, module-agnostic (Tax today; Bookkeeping/Payroll/Business Formation/Advisory attach here later without a redesign). Strictly separate from workspace_users -- clients never become staff and staff never become clients.';
comment on column public.clients.ssn_hash is 'SHA-256 of the normalized SSN salted with workspace_id, for duplicate detection only -- never reversible, unlike ssn_encrypted.';
comment on column public.clients.merged_into_client_id is 'Set when this client record was merged into another; the record is kept (status archived) rather than deleted so history/audit trail survives.';

create index clients_workspace_idx on public.clients (workspace_id, lifecycle_status);
create index clients_ssn_hash_idx on public.clients (workspace_id, ssn_hash) where ssn_hash is not null;
create index clients_ein_hash_idx on public.clients (workspace_id, ein_hash) where ein_hash is not null;
create index clients_normalized_email_idx on public.clients (workspace_id, normalized_email) where normalized_email is not null;
create index clients_normalized_phone_idx on public.clients (workspace_id, normalized_phone) where normalized_phone is not null;
create index clients_name_trgm_idx on public.clients using gin (
  (coalesce(business_name, '') || ' ' || coalesce(first_name, '') || ' ' || coalesce(last_name, '')) extensions.gin_trgm_ops
);

create trigger set_updated_at before update on public.clients for each row execute function public.set_updated_at();
create trigger audit_clients after insert or update or delete on public.clients for each row execute function public.audit_trigger_fn();

alter table public.clients enable row level security;

create policy clients_select on public.clients
  for select using (public.is_workspace_member(workspace_id));

-- No direct INSERT policy: every client must be created through
-- create_client(), which performs duplicate detection first. Without an
-- INSERT policy, direct table inserts are denied by default under RLS.

create policy clients_update on public.clients
  for update using (public.has_permission(workspace_id, 'clients.edit'))
  with check (public.has_permission(workspace_id, 'clients.edit'));

create policy clients_delete on public.clients
  for delete using (public.has_permission(workspace_id, 'clients.delete'));

-- ============================================================================
-- create_client: permission-checked, duplicate-blocking client creation.
-- ============================================================================
create or replace function public.create_client(
  p_workspace_id uuid,
  p_client_type text,
  p_first_name text default null,
  p_last_name text default null,
  p_business_name text default null,
  p_date_of_birth date default null,
  p_primary_email text default null,
  p_primary_phone text default null,
  p_ssn text default null,
  p_ein text default null,
  p_itin text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_normalized_email citext;
  v_normalized_phone text;
  v_ssn_hash text;
  v_ein_hash text;
  v_existing record;
  v_new_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'clients.create') then
    raise exception 'insufficient permissions to create a client in this workspace';
  end if;

  v_normalized_email := nullif(lower(btrim(p_primary_email)), '');
  v_normalized_phone := nullif(regexp_replace(coalesce(p_primary_phone, ''), '\D', '', 'g'), '');
  v_ssn_hash := case when p_ssn is not null and btrim(p_ssn) <> ''
    then encode(digest(regexp_replace(p_ssn, '\D', '', 'g') || p_workspace_id::text, 'sha256'), 'hex') end;
  v_ein_hash := case when p_ein is not null and btrim(p_ein) <> ''
    then encode(digest(regexp_replace(p_ein, '\D', '', 'g') || p_workspace_id::text, 'sha256'), 'hex') end;

  select id, array_remove(array[
      case when v_ssn_hash is not null and ssn_hash = v_ssn_hash then 'ssn' end,
      case when v_ein_hash is not null and ein_hash = v_ein_hash then 'ein' end,
      case when v_normalized_email is not null and normalized_email = v_normalized_email then 'email' end,
      case when v_normalized_phone is not null and normalized_phone = v_normalized_phone then 'phone' end
    ], null) as matched_on
  into v_existing
  from public.clients
  where workspace_id = p_workspace_id
    and merged_into_client_id is null
    and (
      (v_ssn_hash is not null and ssn_hash = v_ssn_hash)
      or (v_ein_hash is not null and ein_hash = v_ein_hash)
      or (v_normalized_email is not null and normalized_email = v_normalized_email)
      or (v_normalized_phone is not null and normalized_phone = v_normalized_phone)
    )
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object('client_id', v_existing.id, 'is_new', false, 'duplicate_matched_on', to_jsonb(v_existing.matched_on));
  end if;

  insert into public.clients (
    workspace_id, client_type, first_name, last_name, business_name, date_of_birth,
    primary_email, primary_phone, normalized_email, normalized_phone,
    ssn_encrypted, ssn_last4, ssn_hash, ein_encrypted, ein_last4, ein_hash,
    itin_encrypted, itin_last4, itin_hash, created_by
  ) values (
    p_workspace_id, p_client_type, p_first_name, p_last_name, p_business_name, p_date_of_birth,
    p_primary_email, p_primary_phone, v_normalized_email, v_normalized_phone,
    public.encrypt_client_secret(p_ssn), nullif(right(regexp_replace(coalesce(p_ssn, ''), '\D', '', 'g'), 4), ''), v_ssn_hash,
    public.encrypt_client_secret(p_ein), nullif(right(regexp_replace(coalesce(p_ein, ''), '\D', '', 'g'), 4), ''), v_ein_hash,
    public.encrypt_client_secret(p_itin), nullif(right(regexp_replace(coalesce(p_itin, ''), '\D', '', 'g'), 4), ''),
    case when p_itin is not null and btrim(p_itin) <> '' then encode(digest(regexp_replace(p_itin, '\D', '', 'g') || p_workspace_id::text, 'sha256'), 'hex') end,
    auth.uid()
  )
  returning id into v_new_id;

  return jsonb_build_object('client_id', v_new_id, 'is_new', true, 'duplicate_matched_on', '[]'::jsonb);
end;
$$;
comment on function public.create_client(uuid, text, text, text, text, date, text, text, text, text, text) is 'Permission-checked client creation with automatic duplicate detection on SSN/EIN hash, normalized email, and normalized phone. Returns the existing client instead of creating a duplicate.';

revoke execute on function public.create_client(uuid, text, text, text, text, date, text, text, text, text, text) from public, anon;
grant execute on function public.create_client(uuid, text, text, text, text, date, text, text, text, text, text) to authenticated;

-- ============================================================================
-- merge_clients: folds a duplicate into the primary record. FK re-pointing
-- for engagements/documents/etc. happens once those tables exist (Phase 3+);
-- for now this simply marks the duplicate as merged and archived.
-- ============================================================================
create or replace function public.merge_clients(
  p_primary_client_id uuid,
  p_duplicate_client_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_dup_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.clients where id = p_primary_client_id;
  select workspace_id into v_dup_workspace_id from public.clients where id = p_duplicate_client_id;

  if v_workspace_id is null or v_dup_workspace_id is null then
    raise exception 'client not found';
  end if;
  if v_workspace_id <> v_dup_workspace_id then
    raise exception 'cannot merge clients from different workspaces';
  end if;
  if not public.has_permission(v_workspace_id, 'clients.merge') then
    raise exception 'insufficient permissions to merge clients in this workspace';
  end if;

  update public.clients
  set merged_into_client_id = p_primary_client_id, lifecycle_status = 'archived'
  where id = p_duplicate_client_id;
end;
$$;
comment on function public.merge_clients(uuid, uuid) is 'Merges a duplicate client into the primary record; the duplicate is kept (archived, merged_into_client_id set) for history rather than deleted.';

revoke execute on function public.merge_clients(uuid, uuid) from public, anon;
grant execute on function public.merge_clients(uuid, uuid) to authenticated;

-- ============================================================================
-- reveal_client_ssn / reveal_client_ein / reveal_client_itin: permission-
-- checked, audit-logged decrypt. Only Owner/Admin/ERO hold the reveal
-- permissions by default (see 0035 seed grants).
-- ============================================================================
create or replace function public.reveal_client_ssn(p_client_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_value text;
begin
  select workspace_id into v_workspace_id from public.clients where id = p_client_id;
  if v_workspace_id is null then
    raise exception 'client not found';
  end if;
  if not public.has_permission(v_workspace_id, 'identity.ssn_reveal') then
    raise exception 'insufficient permissions to reveal this client''s SSN';
  end if;

  select public.decrypt_client_secret(ssn_encrypted) into v_value from public.clients where id = p_client_id;

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (v_workspace_id, auth.uid(), 'clients', p_client_id, 'reveal_ssn', 'warning');

  return v_value;
end;
$$;

create or replace function public.reveal_client_ein(p_client_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_value text;
begin
  select workspace_id into v_workspace_id from public.clients where id = p_client_id;
  if v_workspace_id is null then
    raise exception 'client not found';
  end if;
  if not public.has_permission(v_workspace_id, 'identity.ein_reveal') then
    raise exception 'insufficient permissions to reveal this client''s EIN';
  end if;

  select public.decrypt_client_secret(ein_encrypted) into v_value from public.clients where id = p_client_id;

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (v_workspace_id, auth.uid(), 'clients', p_client_id, 'reveal_ein', 'warning');

  return v_value;
end;
$$;

create or replace function public.reveal_client_itin(p_client_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_value text;
begin
  select workspace_id into v_workspace_id from public.clients where id = p_client_id;
  if v_workspace_id is null then
    raise exception 'client not found';
  end if;
  if not public.has_permission(v_workspace_id, 'identity.itin_reveal') then
    raise exception 'insufficient permissions to reveal this client''s ITIN';
  end if;

  select public.decrypt_client_secret(itin_encrypted) into v_value from public.clients where id = p_client_id;

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (v_workspace_id, auth.uid(), 'clients', p_client_id, 'reveal_itin', 'warning');

  return v_value;
end;
$$;

revoke execute on function public.reveal_client_ssn(uuid) from public, anon;
revoke execute on function public.reveal_client_ein(uuid) from public, anon;
revoke execute on function public.reveal_client_itin(uuid) from public, anon;
grant execute on function public.reveal_client_ssn(uuid) to authenticated;
grant execute on function public.reveal_client_ein(uuid) to authenticated;
grant execute on function public.reveal_client_itin(uuid) to authenticated;

-- Owner/Admin/ERO get ITIN reveal alongside the SSN/EIN reveal they already hold.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.workspace_id is null and r.slug in ('owner', 'admin', 'ero') and p.key = 'identity.itin_reveal'
on conflict do nothing;
