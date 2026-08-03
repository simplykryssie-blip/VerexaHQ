-- Phase 0: Platform Foundation
-- Supabase grants EXECUTE on public-schema functions to anon/authenticated
-- via a schema-level default privilege, separate from PUBLIC. Revoking from
-- PUBLIC alone (0011) didn't touch that direct grant, so the anon role could
-- still call every RPC. Revoke explicitly from anon here; internal helpers
-- and trigger-only functions also lose it from authenticated.

revoke execute on function public.current_workspace_ids() from anon;
revoke execute on function public.is_platform_admin() from anon;
revoke execute on function public.is_workspace_member(uuid) from anon;
revoke execute on function public.is_workspace_admin(uuid) from anon;
revoke execute on function public.has_permission(uuid, text) from anon;

revoke execute on function public.audit_trigger_fn() from anon;
revoke execute on function public.handle_new_auth_user() from anon;

revoke execute on function public.create_workspace(text, text, text) from anon;
revoke execute on function public.get_my_workspaces() from anon;
revoke execute on function public.invite_workspace_user(uuid, uuid, uuid) from anon;
revoke execute on function public.accept_workspace_invitation(uuid) from anon;
revoke execute on function public.revoke_workspace_user(uuid, uuid) from anon;
revoke execute on function public.set_feature_flag(uuid, text, boolean, jsonb) from anon;
