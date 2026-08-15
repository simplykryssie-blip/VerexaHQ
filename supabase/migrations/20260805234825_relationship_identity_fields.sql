-- Related people (spouse, dependent, etc.) aren't always clients
-- themselves, but staff still need to record their DOB/SSN for the return.
-- DOB stored plain (matches clients.date_of_birth); SSN reuses the same
-- vault-backed encryption as clients.ssn_encrypted, revealed through a
-- parallel permission-gated RPC rather than ever exposing it in a plain
-- select.

alter table public.client_relationships
  add column if not exists related_dob date,
  add column if not exists related_ssn_encrypted bytea,
  add column if not exists related_ssn_last4 text;

create or replace function public.create_client_relationship(
  p_client_id uuid,
  p_workspace_id uuid,
  p_relationship_type text,
  p_related_name text,
  p_related_client_id uuid default null,
  p_related_dob date default null,
  p_related_ssn text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to add a relationship in this workspace';
  end if;

  insert into public.client_relationships (
    client_id, workspace_id, relationship_type, related_name, related_client_id,
    related_dob, related_ssn_encrypted, related_ssn_last4
  ) values (
    p_client_id, p_workspace_id, p_relationship_type, p_related_name, p_related_client_id,
    p_related_dob, public.encrypt_client_secret(p_related_ssn),
    nullif(right(regexp_replace(coalesce(p_related_ssn, ''), '\D', '', 'g'), 4), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.reveal_client_relationship_ssn(p_relationship_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
  v_value text;
begin
  select workspace_id into v_workspace_id from public.client_relationships where id = p_relationship_id;
  if v_workspace_id is null then
    raise exception 'relationship not found';
  end if;
  if not public.has_permission(v_workspace_id, 'identity.ssn_reveal') then
    raise exception 'insufficient permissions to reveal this SSN';
  end if;

  select public.decrypt_client_secret(related_ssn_encrypted) into v_value from public.client_relationships where id = p_relationship_id;

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (v_workspace_id, auth.uid(), 'client_relationships', p_relationship_id, 'reveal_ssn', 'warning');

  return v_value;
end;
$$;
