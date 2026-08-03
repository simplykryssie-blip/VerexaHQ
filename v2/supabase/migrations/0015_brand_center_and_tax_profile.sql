-- Phase 2: Firm Configuration Engine
-- Brand Center: extends Phase 0's branding table with the full set of
-- customizable presentation fields. The browser favicon is intentionally
-- NEVER a column here -- it is a hardcoded Verexa asset in the client, not
-- workspace configuration, so there is no column to smuggle it through.
-- Button styles, notification colors, portal/dashboard layouts, and core UI
-- colors are likewise deliberately absent: there is nothing to configure
-- because there is no column for it.
--
-- Business address is intentionally NOT duplicated here -- it already lives
-- on the primary public.office_locations row (Phase 0), avoiding a second
-- source of truth for the same fact.

alter table public.branding drop column favicon_url;

alter table public.branding
  add column dba text,
  add column sidebar_logo_url text,
  add column portal_logo_url text,
  add column email_header_logo_url text,
  add column pdf_header_logo_url text,
  add column business_phone text,
  add column business_email citext,
  add column website_url text,
  add column theme_mode text not null default 'light' check (theme_mode in ('light', 'dark'));

comment on column public.branding.dba is 'Doing-business-as name, shown when it differs from the legal/workspace name.';
comment on column public.branding.primary_color is 'Sidebar accent color. The only brand color a firm may set; core UI colors are not configurable.';
comment on column public.branding.theme_mode is 'Firm-wide default light/dark theme preference.';

-- ============================================================================
-- firm_tax_profile: one row per workspace. EIN/EFIN/PTIN are the firm's own
-- practitioner credentials -- encrypted at rest the same way client SSN/EIN
-- will be in Phase 1, using a Supabase Vault-managed passphrase so the key
-- never appears in migration source or client code.
-- ============================================================================
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'firm_tax_profile_key') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'base64'),
      'firm_tax_profile_key',
      'Symmetric passphrase for encrypting firm EIN/EFIN/PTIN at rest (pgp_sym_encrypt/decrypt).'
    );
  end if;
end $$;

create table public.firm_tax_profile (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  ein_encrypted bytea,
  ein_last4 text,
  efin_encrypted bytea,
  efin_last4 text,
  ptin_encrypted bytea,
  ptin_last4 text,
  supported_filing_states text[] not null default '{}',
  regular_office_hours jsonb not null default '{}'::jsonb,
  tax_season_hours jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on table public.firm_tax_profile is 'Firm-level tax practice identifiers and operating hours. EIN/EFIN/PTIN are stored encrypted; only last4 is ever readable directly.';

create trigger set_updated_at before update on public.firm_tax_profile
  for each row execute function public.set_updated_at();
create trigger audit_firm_tax_profile after insert or update or delete on public.firm_tax_profile
  for each row execute function public.audit_trigger_fn();

alter table public.firm_tax_profile enable row level security;

create policy firm_tax_profile_select on public.firm_tax_profile
  for select using (public.is_workspace_member(workspace_id));

-- ============================================================================
-- Internal encrypt/decrypt helpers. Never exposed to clients directly --
-- only called from the security-definer set/reveal RPCs below.
-- ============================================================================
create or replace function public.encrypt_firm_secret(p_plaintext text)
returns bytea
language sql
security definer
set search_path = public, extensions
as $$
  select case when p_plaintext is null or btrim(p_plaintext) = '' then null
    else pgp_sym_encrypt(p_plaintext, (select decrypted_secret from vault.decrypted_secrets where name = 'firm_tax_profile_key'))
  end;
$$;

create or replace function public.decrypt_firm_secret(p_ciphertext bytea)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select case when p_ciphertext is null then null
    else pgp_sym_decrypt(p_ciphertext, (select decrypted_secret from vault.decrypted_secrets where name = 'firm_tax_profile_key'))
  end;
$$;

revoke execute on function public.encrypt_firm_secret(text) from public, anon, authenticated;
revoke execute on function public.decrypt_firm_secret(bytea) from public, anon, authenticated;

-- ============================================================================
-- set_firm_tax_profile: admin-only upsert. Pass null for any identifier to
-- leave it unchanged (they are all optional per the onboarding wizard).
-- ============================================================================
create or replace function public.set_firm_tax_profile(
  p_workspace_id uuid,
  p_ein text default null,
  p_efin text default null,
  p_ptin text default null,
  p_clear_ein boolean default false,
  p_clear_efin boolean default false,
  p_clear_ptin boolean default false,
  p_supported_filing_states text[] default null,
  p_regular_office_hours jsonb default null,
  p_tax_season_hours jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to manage this workspace''s tax profile';
  end if;

  insert into public.firm_tax_profile (workspace_id)
  values (p_workspace_id)
  on conflict (workspace_id) do nothing;

  update public.firm_tax_profile set
    ein_encrypted = case when p_clear_ein then null when p_ein is not null then public.encrypt_firm_secret(p_ein) else ein_encrypted end,
    ein_last4 = case when p_clear_ein then null when p_ein is not null then right(regexp_replace(p_ein, '\D', '', 'g'), 4) else ein_last4 end,
    efin_encrypted = case when p_clear_efin then null when p_efin is not null then public.encrypt_firm_secret(p_efin) else efin_encrypted end,
    efin_last4 = case when p_clear_efin then null when p_efin is not null then right(regexp_replace(p_efin, '\D', '', 'g'), 4) else efin_last4 end,
    ptin_encrypted = case when p_clear_ptin then null when p_ptin is not null then public.encrypt_firm_secret(p_ptin) else ptin_encrypted end,
    ptin_last4 = case when p_clear_ptin then null when p_ptin is not null then right(regexp_replace(p_ptin, '\D', '', 'g'), 4) else ptin_last4 end,
    supported_filing_states = coalesce(p_supported_filing_states, supported_filing_states),
    regular_office_hours = coalesce(p_regular_office_hours, regular_office_hours),
    tax_season_hours = coalesce(p_tax_season_hours, tax_season_hours),
    updated_by = auth.uid(),
    updated_at = now()
  where workspace_id = p_workspace_id;
end;
$$;
comment on function public.set_firm_tax_profile(uuid, text, text, text, boolean, boolean, boolean, text[], jsonb, jsonb) is 'Workspace-admin upsert of firm EIN/EFIN/PTIN (encrypted) and operating hours.';

revoke execute on function public.set_firm_tax_profile(uuid, text, text, text, boolean, boolean, boolean, text[], jsonb, jsonb) from public;
grant execute on function public.set_firm_tax_profile(uuid, text, text, text, boolean, boolean, boolean, text[], jsonb, jsonb) to authenticated;

-- ============================================================================
-- reveal_firm_ein / reveal_firm_efin / reveal_firm_ptin: admin-only,
-- audit-logged decrypt of the firm's own credentials.
-- ============================================================================
create or replace function public.reveal_firm_ein(p_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value text;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to reveal this workspace''s EIN';
  end if;

  select public.decrypt_firm_secret(ein_encrypted) into v_value
  from public.firm_tax_profile where workspace_id = p_workspace_id;

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (p_workspace_id, auth.uid(), 'firm_tax_profile', p_workspace_id, 'reveal_ein', 'warning');

  return v_value;
end;
$$;

create or replace function public.reveal_firm_efin(p_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value text;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to reveal this workspace''s EFIN';
  end if;

  select public.decrypt_firm_secret(efin_encrypted) into v_value
  from public.firm_tax_profile where workspace_id = p_workspace_id;

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (p_workspace_id, auth.uid(), 'firm_tax_profile', p_workspace_id, 'reveal_efin', 'warning');

  return v_value;
end;
$$;

create or replace function public.reveal_firm_ptin(p_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value text;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to reveal this workspace''s PTIN';
  end if;

  select public.decrypt_firm_secret(ptin_encrypted) into v_value
  from public.firm_tax_profile where workspace_id = p_workspace_id;

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (p_workspace_id, auth.uid(), 'firm_tax_profile', p_workspace_id, 'reveal_ptin', 'warning');

  return v_value;
end;
$$;

revoke execute on function public.reveal_firm_ein(uuid) from public;
revoke execute on function public.reveal_firm_efin(uuid) from public;
revoke execute on function public.reveal_firm_ptin(uuid) from public;
grant execute on function public.reveal_firm_ein(uuid) to authenticated;
grant execute on function public.reveal_firm_efin(uuid) to authenticated;
grant execute on function public.reveal_firm_ptin(uuid) to authenticated;
