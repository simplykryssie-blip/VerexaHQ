alter table public.client_relationships
  add column custom_relationship_title text;

alter table public.client_relationships
  drop constraint client_relationships_relationship_type_check;

alter table public.client_relationships
  add constraint client_relationships_relationship_type_check
  check (relationship_type = any (array['spouse', 'dependent', 'parent', 'child', 'business', 'trust', 'estate', 'partner', 'owner', 'officer', 'attorney', 'other']));

drop function if exists public.create_client_relationship(uuid, uuid, text, text, uuid, date, text);

create or replace function public.create_client_relationship(
  p_client_id uuid,
  p_workspace_id uuid,
  p_relationship_type text,
  p_related_name text,
  p_related_client_id uuid default null::uuid,
  p_related_dob date default null::date,
  p_related_ssn text default null::text,
  p_custom_relationship_title text default null::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to add a relationship in this workspace';
  end if;

  insert into public.client_relationships (
    client_id, workspace_id, relationship_type, related_name, related_client_id,
    related_dob, related_ssn_encrypted, related_ssn_last4, custom_relationship_title
  ) values (
    p_client_id, p_workspace_id, p_relationship_type, p_related_name, p_related_client_id,
    p_related_dob, public.encrypt_client_secret(p_related_ssn),
    nullif(right(regexp_replace(coalesce(p_related_ssn, ''), '\D', '', 'g'), 4), ''),
    p_custom_relationship_title
  )
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.create_client_relationship(uuid, uuid, text, text, uuid, date, text, text) from public, anon;
grant execute on function public.create_client_relationship(uuid, uuid, text, text, uuid, date, text, text) to authenticated;
