-- IRS Form 8821 reconciliation, part 2: designee PTIN reveal.
--
-- reveal_my_ptin() already exists but is self-only -- it can't surface a
-- different staff member's PTIN when that person is named as someone else's
-- 8821 designee. PTIN is encrypted at rest (user_profiles.ptin_encrypted,
-- same decrypt_firm_secret key as reveal_firm_ptin/reveal_my_ptin) and must
-- stay that way: this reveals it transiently for document generation only,
-- gated on the caller having irs_authorizations.manage in the designee's own
-- workspace (default choice: reuse that existing permission rather than
-- minting a new one, since revealing a colleague's PTIN only ever happens
-- as part of generating an 8821 that permission already gates), and the
-- target actually being an active member of that workspace. Audited the
-- same way every other identity-secret reveal in this codebase is.
create or replace function public.reveal_designee_ptin(p_workspace_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_value text;
begin
  if not public.has_permission(p_workspace_id, 'irs_authorizations.manage') then
    raise exception 'insufficient permissions to reveal this designee''s PTIN';
  end if;

  if not exists (
    select 1 from public.workspace_users where workspace_id = p_workspace_id and user_id = p_user_id and status = 'active'
  ) then
    raise exception 'designee is not an active member of this workspace';
  end if;

  select public.decrypt_firm_secret(ptin_encrypted) into v_value from public.user_profiles where id = p_user_id;

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (p_workspace_id, auth.uid(), 'user_profiles', p_user_id, 'reveal_ptin', 'warning');

  return v_value;
end;
$$;

revoke all on function public.reveal_designee_ptin(uuid, uuid) from public, anon;
grant execute on function public.reveal_designee_ptin(uuid, uuid) to authenticated;
