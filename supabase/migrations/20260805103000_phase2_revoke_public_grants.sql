-- This project grants EXECUTE to the PUBLIC pseudo-role by default at
-- function-creation time (standard Postgres behavior unless default
-- privileges are configured otherwise) -- distinct from the anon-specific
-- default grant hit in the Phase 1 migrations. Revoking from PUBLIC closes
-- that for every Phase 1 and Phase 2 function that should only be callable
-- by authenticated/service_role, then re-affirms the intended explicit
-- grants (REVOKE ... FROM PUBLIC does not touch separate explicit grants,
-- but re-stating them here keeps this migration self-contained).
revoke execute on function public.create_early_access_checkout_session_request(uuid, uuid, text, text, text) from public;
revoke execute on function public.provision_early_access_workspace(uuid, uuid, text, text, text, text, text, inet, text) from public;
revoke execute on function public.record_billing_authorization(uuid, uuid, text, text, text, text, numeric, text, timestamptz, inet, text) from public;
revoke execute on function public.can_remove_verexahq_branding(uuid) from public;
revoke execute on function public.list_workspace_member_invitations(uuid) from public;
revoke execute on function public.resend_workspace_member_invitation(uuid) from public;
revoke execute on function public.revoke_workspace_member_invitation(uuid) from public;

grant execute on function public.create_early_access_checkout_session_request(uuid, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.provision_early_access_workspace(uuid, uuid, text, text, text, text, text, inet, text) to service_role;
grant execute on function public.record_billing_authorization(uuid, uuid, text, text, text, text, numeric, text, timestamptz, inet, text) to authenticated, service_role;
