
-- Supabase grants EXECUTE to anon/authenticated by default on every new
-- public-schema function regardless of "revoke ... from public" (that only
-- revokes the PUBLIC pseudo-role, not these two concrete roles). Several
-- functions from this pass never should have been anon/authenticated
-- callable -- tighten them explicitly here.
revoke execute on function public.enqueue_reminder_notifications() from anon, authenticated;
revoke execute on function public.run_critical_path_smoke_tests() from anon, authenticated;
revoke execute on function public.is_notification_enabled(uuid, uuid, text, text) from anon;
