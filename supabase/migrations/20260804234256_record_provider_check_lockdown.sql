-- record_provider_check writes to a platform-wide (not workspace-scoped)
-- operational table with no internal authorization check of its own --
-- unlike has_permission/is_workspace_member-gated RPCs, there's no
-- workspace or role concept to check here. Locking it to service-role
-- only (called from server routes via the service-role client, same
-- privilege tier as the Stripe webhook's writes) closes that gap instead
-- of leaving it callable by any authenticated user via PostgREST.
revoke execute on function public.record_provider_check(text, boolean, text) from authenticated;
