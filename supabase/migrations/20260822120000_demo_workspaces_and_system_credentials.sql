-- Flags a workspace as one of the platform's demo shells (PTIN/ERO/SB),
-- distinct from the real tenants -- used to render the sidebar's demo
-- workspace switcher without hardcoding workspace ids in app code.
alter table public.workspaces add column if not exists is_demo boolean not null default false;

-- Password vault for the systems that run the CRM itself (Stripe, Resend,
-- Supabase, Vercel, GoDaddy, etc.) -- distinct from workspace_ghl_connections
-- and other per-firm credential tables, which store what a *tenant*
-- connected, not what Verexa itself depends on to operate. Reuses the same
-- encrypt_firm_secret/decrypt_firm_secret pair already used for GHL API
-- keys rather than inventing a second encryption scheme.
create table public.platform_system_credentials (
  id uuid primary key default gen_random_uuid(),
  system_name text not null,
  username text,
  secret_encrypted bytea not null,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_system_credentials enable row level security;

-- Listing (system_name/username/notes/timestamps) is a direct select --
-- secret_encrypted is opaque ciphertext even if selected, but the app never
-- selects it directly; decryption only ever happens through the RPC below,
-- on demand, per row. All writes go through the RPCs beneath this policy,
-- not direct table access -- there's deliberately no insert/update/delete
-- policy here.
create policy platform_system_credentials_select on public.platform_system_credentials
  for select using (is_platform_it());

-- Insert (p_id null) or update (p_id set) a credential. An update with a
-- blank p_secret keeps the existing encrypted value -- "leave blank to keep
-- the current password" is the point, not a bug.
create or replace function public.set_platform_system_credential(
  p_id uuid,
  p_system_name text,
  p_username text,
  p_secret text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not is_platform_it() then
    raise exception 'insufficient permissions to manage system credentials';
  end if;

  if p_id is null then
    insert into public.platform_system_credentials (system_name, username, secret_encrypted, notes, created_by)
    values (p_system_name, nullif(btrim(p_username), ''), encrypt_firm_secret(p_secret), nullif(btrim(p_notes), ''), auth.uid())
    returning id into v_id;
  else
    update public.platform_system_credentials
    set system_name = p_system_name,
        username = nullif(btrim(p_username), ''),
        secret_encrypted = case when p_secret is null or btrim(p_secret) = '' then secret_encrypted else encrypt_firm_secret(p_secret) end,
        notes = nullif(btrim(p_notes), ''),
        updated_at = now()
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.set_platform_system_credential(uuid, text, text, text, text) from public, anon;
grant execute on function public.set_platform_system_credential(uuid, text, text, text, text) to authenticated;

-- Decrypts on demand, called only when a viewer explicitly clicks "Show" --
-- never preloaded into the page, so a plaintext secret never sits in
-- server-rendered HTML.
create or replace function public.get_platform_system_credential_secret(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret bytea;
begin
  if not is_platform_it() then
    raise exception 'insufficient permissions to view system credentials';
  end if;

  select secret_encrypted into v_secret from public.platform_system_credentials where id = p_id;
  if v_secret is null then return null; end if;
  return decrypt_firm_secret(v_secret);
end;
$$;

revoke all on function public.get_platform_system_credential_secret(uuid) from public, anon;
grant execute on function public.get_platform_system_credential_secret(uuid) to authenticated;

create or replace function public.delete_platform_system_credential(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_it() then
    raise exception 'insufficient permissions to manage system credentials';
  end if;

  delete from public.platform_system_credentials where id = p_id;
end;
$$;

revoke all on function public.delete_platform_system_credential(uuid) from public, anon;
grant execute on function public.delete_platform_system_credential(uuid) to authenticated;
