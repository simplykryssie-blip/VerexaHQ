-- Revision Sprint -- advisor cleanup
-- is_account_locked() was only revoked from `public`, missing the same
-- direct-to-anon default grant every new function needs revoking (see
-- Phase 0 migration 0012 and Phase 2 migration 0032 for the same fix).
-- Letting anon call it would allow probing whether an arbitrary user id is
-- currently locked out.

revoke execute on function public.is_account_locked(uuid) from anon;
