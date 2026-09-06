-- Staff-driven advancement for the stages Verexa has no API visibility
-- into (everything after the client signs). Forward-only and rank-checked
-- against the enum's real order, same intent as
-- enforce_engagement_signature_gate's transition gating, except here it's
-- enforced in the setter itself rather than a trigger since every one of
-- these transitions is staff-initiated, not a side effect of another
-- table's write. 'denied'/'revoked' are terminal overrides allowed from
-- any non-terminal state.
create or replace function public.set_irs_authorization_status(
  p_authorization_id uuid,
  p_status public.irs_authorization_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
  v_current public.irs_authorization_status;
  v_rank_current int;
  v_rank_new int;
  v_order text[] := array[
    'draft', 'awaiting_identity_verification', 'identity_verification_rejected',
    'identity_verified', 'awaiting_signature', 'signed',
    'submitted', 'irs_processing', 'authorized', 'transcript_eligible'
  ];
begin
  select workspace_id, status into v_workspace_id, v_current
  from public.irs_authorizations where id = p_authorization_id;

  if v_workspace_id is null then
    raise exception 'authorization not found';
  end if;

  if not public.has_permission(v_workspace_id, 'irs_authorizations.manage') then
    raise exception 'insufficient permissions to update this authorization''s status';
  end if;

  if v_current in ('denied', 'revoked') then
    raise exception 'this authorization is % and cannot be advanced further', v_current;
  end if;

  if p_status not in ('submitted', 'irs_processing', 'authorized', 'transcript_eligible', 'denied', 'revoked') then
    raise exception 'this status can only be reached automatically (identity verification or signing), not set manually';
  end if;

  if p_status not in ('denied', 'revoked') then
    v_rank_current := array_position(v_order, v_current::text);
    v_rank_new := array_position(v_order, p_status::text);
    if v_rank_current is null or v_rank_new is null or v_rank_new <= v_rank_current then
      raise exception 'cannot move from % to % -- status can only move forward', v_current, p_status;
    end if;
  end if;

  update public.irs_authorizations
  set status = p_status,
      staff_note = coalesce(p_note, staff_note),
      submitted_at = case when p_status = 'submitted' and submitted_at is null then now() else submitted_at end,
      authorized_at = case when p_status = 'authorized' and authorized_at is null then now() else authorized_at end,
      updated_at = now()
  where id = p_authorization_id;
end;
$$;

revoke all on function public.set_irs_authorization_status(uuid, public.irs_authorization_status, text) from public, anon;
grant execute on function public.set_irs_authorization_status(uuid, public.irs_authorization_status, text) to authenticated;
