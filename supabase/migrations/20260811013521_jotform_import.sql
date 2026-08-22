-- Per-workspace JotForm API key (bring-your-own-key -- unlike Resend/Twilio/
-- Stripe/Zoom, which are platform-level credentials set via environment
-- variables, a JotForm account belongs to the firm itself). RLS is enabled
-- with no policies at all -- every interaction goes through a SECURITY
-- DEFINER RPC below so the key is never selectable directly, only settable,
-- checkable (boolean), or revealed server-side for the one API route that
-- calls JotForm on the firm's behalf.

create table public.workspace_jotform_connections (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  api_key_encrypted bytea not null,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now()
);

alter table public.workspace_jotform_connections enable row level security;

create or replace function public.set_workspace_jotform_api_key(p_workspace_id uuid, p_api_key text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to connect JotForm for this workspace';
  end if;
  if p_api_key is null or btrim(p_api_key) = '' then
    raise exception 'API key is required';
  end if;

  insert into public.workspace_jotform_connections (workspace_id, api_key_encrypted, connected_by)
  values (p_workspace_id, public.encrypt_firm_secret(p_api_key), auth.uid())
  on conflict (workspace_id) do update
    set api_key_encrypted = excluded.api_key_encrypted,
        connected_by = excluded.connected_by,
        connected_at = now();
end;
$function$;

create or replace function public.disconnect_workspace_jotform(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to disconnect JotForm for this workspace';
  end if;
  delete from public.workspace_jotform_connections where workspace_id = p_workspace_id;
end;
$function$;

create or replace function public.is_workspace_jotform_connected(p_workspace_id uuid)
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.workspace_jotform_connections where workspace_id = p_workspace_id);
$function$;

-- Server-side only: the Next.js API route that actually calls JotForm's API
-- calls this on behalf of the signed-in admin to get the plaintext key just
-- long enough to make one request. Never exposed to the browser.
create or replace function public.get_workspace_jotform_api_key(p_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_value text;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to use this workspace''s JotForm connection';
  end if;

  select public.decrypt_firm_secret(api_key_encrypted) into v_value
  from public.workspace_jotform_connections where workspace_id = p_workspace_id;

  return v_value;
end;
$function$;

revoke all on function public.set_workspace_jotform_api_key(uuid, text) from public, anon;
revoke all on function public.disconnect_workspace_jotform(uuid) from public, anon;
revoke all on function public.is_workspace_jotform_connected(uuid) from public, anon;
revoke all on function public.get_workspace_jotform_api_key(uuid) from public, anon;
grant execute on function public.set_workspace_jotform_api_key(uuid, text) to authenticated;
grant execute on function public.disconnect_workspace_jotform(uuid) to authenticated;
grant execute on function public.is_workspace_jotform_connected(uuid) to authenticated;
grant execute on function public.get_workspace_jotform_api_key(uuid) to authenticated;
