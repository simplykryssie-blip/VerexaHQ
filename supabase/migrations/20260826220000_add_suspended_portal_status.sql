-- Client Portal Lifecycle needs a distinct "Suspended" state, separate from
-- "Revoked": revoked already means "invite token expired/dead, needs a full
-- reissue" (revoke_expired_portal_access, 30 days unconfirmed). Suspended is
-- new -- a staff member temporarily blocking an ALREADY-ACTIVE account's
-- access without killing their real login. Reactivating from suspended is a
-- plain status flip back to 'active' (their auth.users account and password
-- still exist and work); reactivating from revoked still requires the
-- existing "reissue" flow since that token really is dead.
--
-- No new RPCs needed -- the existing client_portal_users_update RLS policy
-- already gates any status change on has_permission(workspace_id,
-- 'portal.manage'), so a direct .update() from the browser is safe as-is.
alter table public.client_portal_users drop constraint client_portal_users_status_check;
alter table public.client_portal_users add constraint client_portal_users_status_check
  check (status = any (array['invited'::text, 'active'::text, 'revoked'::text, 'suspended'::text]));
