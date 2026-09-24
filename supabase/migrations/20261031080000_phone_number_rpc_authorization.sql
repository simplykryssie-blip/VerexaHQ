-- Migration history recovery -- confirmed live in production (2026-09-24)
-- via direct grant inspection (has_function_privilege), byte-for-byte from
-- the original commit (f5b10df, on the unmerged claude/verexa-remove-
-- services-vaqbfx branch) that was never brought to main. This file is a
-- safe no-op against current production, which already has exactly these
-- grants; its purpose is so a fresh replay of this migrations directory
-- converges on the same state production is already in.
--
-- Security fix: provision_phone_number_record and bill_and_pause_phone_numbers
-- are SECURITY DEFINER functions (bypass RLS entirely) that were granted
-- EXECUTE to `authenticated` with no internal authorization check -- any
-- signed-in user could call either RPC directly through the Supabase client
-- (bypassing app/api/phone-numbers/provision/route.ts's workspace-owner
-- check entirely) and manipulate an arbitrary workspace's phone-number
-- records or billing state just by supplying a different p_workspace_id.
-- bill_and_pause_phone_numbers is worse: called with no argument (its
-- default), it sweeps every workspace on the platform in one call.
--
-- Root cause: the original migration (20260914010000_workspace_phone_numbers)
-- revoked EXECUTE from `public, anon` and granted only to `service_role`,
-- but never revoked from `authenticated` -- so the default EXECUTE grant
-- Supabase applies to every new function in the `public` schema was never
-- removed for these two. This is the exact same gap already found and
-- fixed for reserve_usage_unit/refund_usage_unit/credit_prepaid_balance/
-- grant_workspace_usage_meters/check_storage_capacity in
-- 20261014000000_usage_billing_correctness's Part 10 -- these two were
-- simply missed in that pass.
--
-- Fix: same pattern as that Part 10 fix, applied here. Both functions are
-- confirmed only ever called from server-side code on the service-role
-- client (app/api/phone-numbers/provision/route.ts, which does its own
-- workspace-owner check before calling; app/api/cron/bill-phone-numbers/
-- route.ts, gated by CRON_SECRET; lib/stripe/handleCheckoutCompleted.ts,
-- with workspace_id sourced from Stripe checkout-session metadata Verexa
-- itself set, not client input) -- there is no legitimate path where an
-- authenticated end user needs to call either RPC directly. Restricting
-- EXECUTE to service_role only closes the bypass at the database boundary
-- itself (Postgres refuses the call before the function body ever runs),
-- which is stronger than an internal auth.uid()-based check here -- and an
-- internal is_workspace_admin()-style check (the pattern used by
-- claim_pending_paid_seat/release_paid_seat, which ARE meant to be called
-- directly by an authenticated workspace admin) would actively break these
-- two, since a service-role call carries no JWT and auth.uid() is null in
-- that context.

revoke execute on function public.provision_phone_number_record(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.bill_and_pause_phone_numbers(uuid) from public, anon, authenticated;

grant execute on function public.provision_phone_number_record(uuid, text, text) to service_role;
grant execute on function public.bill_and_pause_phone_numbers(uuid) to service_role;
