-- REVOKE ... FROM PUBLIC did not remove anon's grant because this project's
-- default privileges explicitly grant EXECUTE to anon at function-creation
-- time (confirmed: anon still listed in information_schema.routine_privileges
-- after the prior revoke). Revoking directly from anon to match the
-- established convention (the pre-existing remove_workspace_member has no
-- anon grant at all).
revoke execute on function public.can_remove_verexahq_branding(uuid) from anon;
revoke execute on function public.list_workspace_member_invitations(uuid) from anon;
revoke execute on function public.resend_workspace_member_invitation(uuid) from anon;
revoke execute on function public.revoke_workspace_member_invitation(uuid) from anon;
