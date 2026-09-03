-- Arbiter index for invite_portal_user's ON CONFLICT (re-inviting the same
-- pending email for the same client rotates the token instead of creating
-- a duplicate row).
create unique index idx_client_portal_users_pending_email
  on public.client_portal_users (client_id, lower(invited_email::text))
  where status = 'invited';
