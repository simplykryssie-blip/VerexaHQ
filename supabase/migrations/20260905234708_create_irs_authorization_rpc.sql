-- Staff creates a draft IRS Form 8821 authorization for a client. Snapshots
-- the designee's display name + CAF number at creation time (not a live
-- join) -- same reasoning as signature_request_signers.typed_name: the
-- generated document and this record should keep reflecting who was
-- actually named, even if that staff member's profile changes later.
create or replace function public.create_irs_authorization(
  p_workspace_id uuid,
  p_client_id uuid,
  p_engagement_id uuid,
  p_taxpayer_type text,
  p_designee_user_id uuid,
  p_tax_matters jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_designee_name text;
  v_designee_caf_number text;
begin
  if not public.has_permission(p_workspace_id, 'irs_authorizations.manage') then
    raise exception 'insufficient permissions to create an IRS authorization in this workspace';
  end if;

  if p_taxpayer_type not in ('individual', 'business') then
    raise exception 'invalid taxpayer type';
  end if;

  if not exists (select 1 from public.clients where id = p_client_id and workspace_id = p_workspace_id) then
    raise exception 'client not found in this workspace';
  end if;

  if p_engagement_id is not null and not exists (
    select 1 from public.engagements where id = p_engagement_id and workspace_id = p_workspace_id and client_id = p_client_id
  ) then
    raise exception 'engagement not found for this client';
  end if;

  select coalesce(nullif(display_name, ''), nullif(trim(concat_ws(' ', first_name, last_name)), ''), 'Staff member'), caf_number
    into v_designee_name, v_designee_caf_number
  from public.user_profiles
  where id = p_designee_user_id;

  if not found then
    raise exception 'designee not found';
  end if;

  insert into public.irs_authorizations (
    workspace_id, client_id, engagement_id, taxpayer_type,
    designee_user_id, designee_name, designee_caf_number, tax_matters, created_by
  ) values (
    p_workspace_id, p_client_id, p_engagement_id, p_taxpayer_type,
    p_designee_user_id, v_designee_name, v_designee_caf_number, coalesce(p_tax_matters, '[]'::jsonb), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_irs_authorization(uuid, uuid, uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.create_irs_authorization(uuid, uuid, uuid, text, uuid, jsonb) to authenticated;
