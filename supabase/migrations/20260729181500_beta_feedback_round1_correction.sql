-- Correction to 20260729180000/180500: a prior multi-statement inspection
-- query silently discarded its first result set, which hid three
-- already-existing, already-correct RPCs: set_workspace_member_role,
-- set_workspace_member_status, and remove_workspace_member(workspace_id,
-- user_id, reason) -- all three restricted to the workspace Owner only.
-- The two functions this drops were unnecessary duplicates that used a
-- looser Owner-OR-Admin authorization check; dropping them so the app only
-- ever calls the existing, stricter, audited path.
drop function if exists public.remove_workspace_member(p_member_id uuid);
drop function if exists public.update_workspace_member_role(p_member_id uuid, p_role text);

-- The last-Account-Owner trigger added in 20260729180000 is also redundant
-- (set_workspace_member_role/status and remove_workspace_member already
-- refuse to target the owner_id user, and protect_workspace_member_
-- privileged_fields already blocks it at the row level) and, unlike those,
-- it never exempts auth.role() = 'service_role' -- it could incorrectly
-- block a legitimate service-role-driven ownership transfer. Removing it
-- rather than risk that.
drop trigger if exists trg_prevent_last_owner_change on public.workspace_members;
drop function if exists public.prevent_last_owner_change();

-- Lock down the four RPCs that are genuinely new (no prior equivalent
-- existed): Postgres grants EXECUTE to PUBLIC by default at creation time
-- in this project, so anon could call them. Each function already checks
-- auth.uid()/can_manage_workspace/is_platform_admin internally and would
-- reject anon, but tightening the grant removes the exposure at the root.
revoke execute on function public.can_remove_verexahq_branding(uuid) from public;
revoke execute on function public.list_workspace_member_invitations(uuid) from public;
revoke execute on function public.resend_workspace_member_invitation(uuid) from public;
revoke execute on function public.revoke_workspace_member_invitation(uuid) from public;

grant execute on function public.can_remove_verexahq_branding(uuid) to authenticated;
grant execute on function public.list_workspace_member_invitations(uuid) to authenticated;
grant execute on function public.resend_workspace_member_invitation(uuid) to authenticated;
grant execute on function public.revoke_workspace_member_invitation(uuid) to authenticated;
