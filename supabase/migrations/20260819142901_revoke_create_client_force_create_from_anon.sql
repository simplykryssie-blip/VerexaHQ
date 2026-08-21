-- A brand new overload (see the previous migration's comment) starts out
-- with default PUBLIC/anon execute grants, undoing the earlier
-- revoke_create_engagement_from_anon-style hardening. has_permission()
-- already blocks an unauthenticated caller in practice, but anon shouldn't
-- be able to invoke this at all.
revoke all on function public.create_client(uuid, text, text, text, text, date, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.create_client(uuid, text, text, text, text, date, text, text, text, text, text, boolean) to authenticated;
