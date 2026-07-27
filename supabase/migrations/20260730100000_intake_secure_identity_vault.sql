-- Secure identity information (SSN / ITIN / ATIN / IP PIN) for the public
-- tax intake -- taxpayer, spouse, and each dependent. Modeled directly on
-- the existing client_identity_vault / client_identity_change_events
-- architecture (same encryption mechanism, same masked-value-only audit
-- trail) rather than inventing a new one, per the project's existing
-- sensitive-data pattern. The one necessary adaptation: client_identity_*
-- requires an authenticated staff session (auth.uid()) and a client_id --
-- neither exists yet during a public, unauthenticated intake draft. So
-- writes here are anon-callable but strictly token-scoped, exactly like
-- every other public intake RPC (start_public_intake, save_intake_progress,
-- public_update_document_request): the token resolves to exactly one
-- intake_id, and every operation is re-checked against that same
-- intake_id. The raw value is NEVER returned to the browser after saving
-- (the save RPC strips it, mirroring save_identity_vault_value), and it
-- never enters the intakes.answers jsonb blob that's merged/read/logged
-- everywhere else in this schema -- it lives only in this table, gated
-- behind pgp_sym_encrypt with the same Vault-managed master key already
-- provisioned for client_identity_vault, and is only ever decrypted by a
-- staff-only, permission-gated, rate-limited reveal function.

create table if not exists public.intake_identity_vault (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intakes(id) on delete cascade,
  workspace_id uuid not null,
  -- childcare_provider covers a repeatable childcare provider's own
  -- SSN/EIN (a third party, not the taxpayer/spouse/dependent themselves)
  -- entered under the Section 2 childcare workflow.
  person_type text not null check (person_type in ('taxpayer', 'spouse', 'dependent', 'childcare_provider')),
  person_ref text,
  identity_type text not null check (identity_type in ('ssn', 'itin', 'atin', 'ip_pin', 'ein')),
  status text not null default 'provided' check (status in ('provided', 'will_provide_later', 'need_help')),
  encrypted_payload jsonb,
  masked_value text,
  last_four text,
  fingerprint text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_identity_vault_dependent_ref check (
    (person_type in ('dependent', 'childcare_provider') and coalesce(trim(person_ref), '') <> '') or
    (person_type not in ('dependent', 'childcare_provider'))
  )
);

create unique index if not exists intake_identity_vault_person_uidx
  on public.intake_identity_vault (intake_id, person_type, coalesce(person_ref, ''), identity_type);

create index if not exists intake_identity_vault_intake_idx on public.intake_identity_vault (intake_id);

alter table public.intake_identity_vault enable row level security;
drop policy if exists intake_identity_vault_service_only on public.intake_identity_vault;
create policy intake_identity_vault_service_only on public.intake_identity_vault for all to service_role using (true) with check (true);

create table if not exists public.intake_identity_change_events (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intakes(id) on delete cascade,
  vault_id uuid not null,
  person_type text not null,
  identity_type text not null,
  event_type text not null check (event_type in ('created', 'replaced', 'status_changed', 'revealed')),
  previous_masked_value text,
  new_masked_value text,
  actor text not null default 'client',
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists intake_identity_change_events_intake_idx on public.intake_identity_change_events (intake_id);

alter table public.intake_identity_change_events enable row level security;
drop policy if exists intake_identity_change_events_service_only on public.intake_identity_change_events;
create policy intake_identity_change_events_service_only on public.intake_identity_change_events for all to service_role using (true) with check (true);

-- Append-only: this is an audit trail, never editable or deletable, same
-- pattern as intake_status_history.
create or replace function public.prevent_intake_identity_events_mutation()
returns trigger language plpgsql as $function$
begin
  raise exception 'intake_identity_change_events is append-only';
end;
$function$;

drop trigger if exists trg_prevent_intake_identity_events_mutation on public.intake_identity_change_events;
create trigger trg_prevent_intake_identity_events_mutation
  before update or delete on public.intake_identity_change_events
  for each row execute function public.prevent_intake_identity_events_mutation();

-- ---------------------------------------------------------------------
-- public_save_intake_identity -- anon-callable, token-scoped write. Only
-- path by which a plain SSN/ITIN/ATIN/IP PIN value ever touches the
-- server, and it is encrypted in the same statement that receives it --
-- the plaintext is never written anywhere else (not answers jsonb, not
-- logs: the audit event below only ever stores new_masked_value).
-- ---------------------------------------------------------------------
create or replace function public.public_save_intake_identity(
  p_token text,
  p_person_type text,
  p_identity_type text,
  p_status text,
  p_person_ref text default null,
  p_plain_value text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
  v_row public.intake_return_tokens%rowtype;
  v_intake public.intakes%rowtype;
  v_normalized text;
  v_master_key text;
  v_fingerprint_key text;
  v_cipher bytea;
  v_payload jsonb;
  v_masked text;
  v_last4 text;
  v_fingerprint text;
  v_vault_id uuid;
  v_old_masked text;
begin
  if p_person_type not in ('taxpayer', 'spouse', 'dependent', 'childcare_provider') then
    raise exception 'Invalid person type.';
  end if;
  if p_person_type in ('dependent', 'childcare_provider') and coalesce(trim(p_person_ref), '') = '' then
    raise exception 'A reference is required.';
  end if;
  if p_identity_type not in ('ssn', 'itin', 'atin', 'ip_pin', 'ein') then
    raise exception 'Invalid identity type.';
  end if;
  if p_status not in ('provided', 'will_provide_later', 'need_help') then
    raise exception 'Invalid status.';
  end if;

  select * into v_row from public.intake_return_tokens where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found or v_row.status <> 'active' or v_row.revoked_at is not null or v_row.expires_at <= now() then
    raise exception 'This link is invalid or has expired.';
  end if;

  select * into v_intake from public.intakes where id = v_row.intake_id;
  if not found then raise exception 'Intake not found.'; end if;

  if p_status = 'provided' then
    v_normalized := regexp_replace(coalesce(p_plain_value, ''), '[^0-9]', '', 'g');
    if p_identity_type = 'ip_pin' then
      if length(v_normalized) <> 6 then raise exception 'An IP PIN must be 6 digits.'; end if;
    else
      if length(v_normalized) <> 9 then raise exception 'That doesn''t look like a valid number.'; end if;
    end if;

    v_master_key := public._verexa_vault_secret('verexa_identity_vault_master_key');
    v_fingerprint_key := public._verexa_vault_secret('verexa_identity_fingerprint_key');
    if v_master_key is null or v_fingerprint_key is null then
      raise exception 'Secure identity storage is not configured.';
    end if;

    v_cipher := extensions.pgp_sym_encrypt(v_normalized, v_master_key, 'cipher-algo=aes256, compress-algo=0');
    v_payload := jsonb_build_object('v', 1, 'alg', 'pgp-aes256', 'ciphertext', encode(v_cipher, 'base64'));
    v_last4 := right(v_normalized, 4);
    v_masked := case p_identity_type
      when 'ssn' then '***-**-' || v_last4
      when 'itin' then '9**-**-' || v_last4
      when 'atin' then '9**-**-' || v_last4
      when 'ein' then '**-***' || v_last4
      when 'ip_pin' then '**-**-' || v_last4
      else repeat('*', 5) || v_last4
    end;
    v_fingerprint := encode(extensions.hmac(v_normalized, v_fingerprint_key, 'sha256'), 'hex');
  else
    v_payload := null;
    v_masked := null;
    v_last4 := null;
    v_fingerprint := null;
  end if;

  select id, masked_value into v_vault_id, v_old_masked
  from public.intake_identity_vault
  where intake_id = v_row.intake_id
    and person_type = p_person_type
    and coalesce(person_ref, '') = coalesce(p_person_ref, '')
    and identity_type = p_identity_type
  for update;

  if v_vault_id is null then
    insert into public.intake_identity_vault (
      intake_id, workspace_id, person_type, person_ref, identity_type, status, encrypted_payload, masked_value, last_four, fingerprint, note
    ) values (
      v_row.intake_id, v_intake.workspace_id, p_person_type, p_person_ref, p_identity_type, p_status, v_payload, v_masked, v_last4, v_fingerprint, p_note
    ) returning id into v_vault_id;

    insert into public.intake_identity_change_events (intake_id, vault_id, person_type, identity_type, event_type, new_masked_value, actor)
    values (v_row.intake_id, v_vault_id, p_person_type, p_identity_type, 'created', coalesce(v_masked, p_status), 'client');
  else
    update public.intake_identity_vault
    set status = p_status, encrypted_payload = v_payload, masked_value = v_masked, last_four = v_last4,
        fingerprint = v_fingerprint, note = p_note, updated_at = now()
    where id = v_vault_id;

    insert into public.intake_identity_change_events (intake_id, vault_id, person_type, identity_type, event_type, previous_masked_value, new_masked_value, actor)
    values (v_row.intake_id, v_vault_id, p_person_type, p_identity_type, 'replaced', v_old_masked, coalesce(v_masked, p_status), 'client');
  end if;

  return jsonb_build_object(
    'vault_id', v_vault_id,
    'person_type', p_person_type,
    'person_ref', p_person_ref,
    'identity_type', p_identity_type,
    'status', p_status,
    'masked_value', v_masked,
    'last_four', v_last4
  );
end;
$function$;

revoke execute on function public.public_save_intake_identity(text, text, text, text, text, text, text) from public;
grant execute on function public.public_save_intake_identity(text, text, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- public_intake_identity_status -- anon-callable, token-scoped read of
-- ONLY masked values/status for the client's own review screen. Never
-- returns encrypted_payload or a plain value.
-- ---------------------------------------------------------------------
create or replace function public.public_intake_identity_status(p_token text)
returns table (
  vault_id uuid, person_type text, person_ref text, identity_type text,
  status text, masked_value text, last_four text, updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
  v_row public.intake_return_tokens%rowtype;
begin
  select * into v_row from public.intake_return_tokens where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found or v_row.status <> 'active' or v_row.revoked_at is not null or v_row.expires_at <= now() then
    raise exception 'This link is invalid or has expired.';
  end if;
  return query
    select v.id, v.person_type, v.person_ref, v.identity_type, v.status, v.masked_value, v.last_four, v.updated_at
    from public.intake_identity_vault v
    where v.intake_id = v_row.intake_id
    order by v.person_type, v.person_ref nulls first, v.identity_type;
end;
$function$;

revoke execute on function public.public_intake_identity_status(text) from public;
grant execute on function public.public_intake_identity_status(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- get_intake_identity_vault_masked / get_intake_identity_vault_value --
-- staff-only. Mirror get_client_identity_vault_masked /
-- get_identity_vault_value exactly (same permission function, same rate
-- limit, same masked-only audit logging) so an intake-review screen can
-- show masked identity status and, for permitted staff, reveal the real
-- value under the same governance as every other secure client field.
-- ---------------------------------------------------------------------
create or replace function public.get_intake_identity_vault_masked(p_intake_id uuid)
returns jsonb
language sql
security definer
set search_path to 'public, auth'
as $function$
  select case when auth.uid() is not null and public.is_workspace_member(i.workspace_id) then
    coalesce(jsonb_agg(jsonb_build_object(
      'vault_id', v.id, 'person_type', v.person_type, 'person_ref', v.person_ref, 'identity_type', v.identity_type,
      'status', v.status, 'masked_value', v.masked_value, 'last_four', v.last_four, 'updated_at', v.updated_at
    ) order by v.person_type, v.person_ref nulls first, v.identity_type), '[]'::jsonb)
  else '[]'::jsonb end
  from public.intakes i
  left join public.intake_identity_vault v on v.intake_id = i.id
  where i.id = p_intake_id
  group by i.workspace_id;
$function$;

-- Supabase's default privileges auto-grant EXECUTE on every new public-
-- schema function to anon and authenticated directly (not just via the
-- PUBLIC pseudo-role), so "revoke ... from public" alone does not remove
-- anon's access -- anon must be revoked explicitly too. Confirmed live via
-- has_function_privilege('anon', ..., 'execute') = false after this.
revoke execute on function public.get_intake_identity_vault_masked(uuid) from public, anon;
grant execute on function public.get_intake_identity_vault_masked(uuid) to authenticated;

create or replace function public.get_intake_identity_vault_value(p_intake_id uuid, p_vault_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public, auth, extensions'
as $function$
declare
  v_intake public.intakes%rowtype;
  v_record public.intake_identity_vault%rowtype;
  v_master_key text;
  v_plain text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into v_intake from public.intakes where id = p_intake_id;
  if v_intake.id is null then raise exception 'intake not found'; end if;

  if not public.current_user_can_reveal_secure_client_data(v_intake.workspace_id) then
    raise exception 'permission denied';
  end if;
  if not public.current_user_secure_reveal_rate_ok(v_intake.workspace_id) then
    raise exception 'rate limit reached';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason required'; end if;

  select * into v_record from public.intake_identity_vault
  where id = p_vault_id and intake_id = p_intake_id;
  if v_record.id is null then raise exception 'vault record not found'; end if;
  if v_record.status <> 'provided' or v_record.encrypted_payload is null then
    raise exception 'no value has been provided for this record';
  end if;

  v_master_key := public._verexa_vault_secret('verexa_identity_vault_master_key');
  if v_master_key is null then raise exception 'identity vault key unavailable'; end if;
  v_plain := extensions.pgp_sym_decrypt(decode(v_record.encrypted_payload->>'ciphertext', 'base64'), v_master_key);

  insert into public.intake_identity_change_events (intake_id, vault_id, person_type, identity_type, event_type, new_masked_value, actor, reason)
  values (p_intake_id, v_record.id, v_record.person_type, v_record.identity_type, 'revealed', v_record.masked_value, 'staff:' || auth.uid()::text, p_reason);

  return jsonb_build_object('vault_id', v_record.id, 'identity_type', v_record.identity_type, 'value', v_plain, 'masked_value', v_record.masked_value);
end;
$function$;

revoke execute on function public.get_intake_identity_vault_value(uuid, uuid, text) from public, anon;
grant execute on function public.get_intake_identity_vault_value(uuid, uuid, text) to authenticated;
