-- Per-workspace GoHighLevel Private Integration Token (bring-your-own-key,
-- same shape as workspace_jotform_connections). RLS is enabled with no
-- policies at all -- every interaction goes through a SECURITY DEFINER RPC
-- below so the token is never selectable directly, only settable, checkable
-- (boolean), or revealed server-side for the one API route that calls GHL
-- on the firm's behalf. Reuses the existing encrypt_firm_secret/
-- decrypt_firm_secret pair rather than a new Vault key.

create table public.workspace_ghl_connections (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  api_key_encrypted bytea not null,
  location_id text not null,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now()
);

alter table public.workspace_ghl_connections enable row level security;

create or replace function public.set_workspace_ghl_connection(p_workspace_id uuid, p_api_key text, p_location_id text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to connect GoHighLevel for this workspace';
  end if;
  if p_api_key is null or btrim(p_api_key) = '' then
    raise exception 'API token is required';
  end if;
  if p_location_id is null or btrim(p_location_id) = '' then
    raise exception 'Location ID is required';
  end if;

  insert into public.workspace_ghl_connections (workspace_id, api_key_encrypted, location_id, connected_by)
  values (p_workspace_id, public.encrypt_firm_secret(p_api_key), btrim(p_location_id), auth.uid())
  on conflict (workspace_id) do update
    set api_key_encrypted = excluded.api_key_encrypted,
        location_id = excluded.location_id,
        connected_by = excluded.connected_by,
        connected_at = now();
end;
$function$;

create or replace function public.disconnect_workspace_ghl(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to disconnect GoHighLevel for this workspace';
  end if;
  delete from public.workspace_ghl_connections where workspace_id = p_workspace_id;
end;
$function$;

create or replace function public.is_workspace_ghl_connected(p_workspace_id uuid)
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.workspace_ghl_connections where workspace_id = p_workspace_id);
$function$;

-- Server-side only: the Next.js API route that actually calls GHL calls
-- this on behalf of the signed-in admin to get the plaintext token and
-- location ID just long enough to make requests. Never exposed to the browser.
create or replace function public.get_workspace_ghl_connection(p_workspace_id uuid)
returns table(api_key text, location_id text)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to use this workspace''s GoHighLevel connection';
  end if;

  return query
    select public.decrypt_firm_secret(c.api_key_encrypted), c.location_id
    from public.workspace_ghl_connections c
    where c.workspace_id = p_workspace_id;
end;
$function$;

revoke all on function public.set_workspace_ghl_connection(uuid, text, text) from public, anon;
revoke all on function public.disconnect_workspace_ghl(uuid) from public, anon;
revoke all on function public.is_workspace_ghl_connected(uuid) from public, anon;
revoke all on function public.get_workspace_ghl_connection(uuid) from public, anon;
grant execute on function public.set_workspace_ghl_connection(uuid, text, text) to authenticated;
grant execute on function public.disconnect_workspace_ghl(uuid) to authenticated;
grant execute on function public.is_workspace_ghl_connected(uuid) to authenticated;
grant execute on function public.get_workspace_ghl_connection(uuid) to authenticated;
